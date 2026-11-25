"""Account authentication and private character profiles; additive SQLite migration.

Only a valid pre-account guest cookie can claim its original room, and only once.
Account sessions are separate from historical capture sessions.
"""
from __future__ import annotations
import hashlib, hmac, json, re, secrets, sqlite3, threading, time, unicodedata, uuid
from pathlib import Path
from world_capture import CaptureError, MAX_PLAYERS, TOKEN, digest
from hotel_lobby import CAPACITY

OPTIONS=json.loads((Path(__file__).resolve().parent/'web/engine/character_options.json').read_text('utf8'))
DEFAULT_AVATAR={key:entry['default'] for key,entry in OPTIONS.items()}
ITERATIONS=600_000
SESSION_TTL=30*86400
EMAIL=re.compile(r'^[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$')
DUMMY_SALT=bytes.fromhex('08fae223bb47fa85f27293a91b93d00c')

def clean_avatar(value):
    if not isinstance(value,dict) or set(value)!=set(OPTIONS):
        raise CaptureError('Unvollstaendiges Charakterprofil',400)
    for k,v in value.items():
        if type(v) is not int or not 0<=v<len(OPTIONS[k]['values']):
            raise CaptureError('Ungueltige Charakterauswahl',400)
    return dict(value)

def credentials(email,password,registration=False):
    if not isinstance(email,str) or len(email)>254 or not EMAIL.fullmatch(email.strip()):
        raise CaptureError('Gueltige E-Mail-Adresse erforderlich',400)
    if not isinstance(password,str) or not 1<=len(password)<=128 or len(password.encode('utf8'))>512:
        raise CaptureError('Ungueltiges Passwort',400)
    if registration and len(password)<10:
        raise CaptureError('Passwort muss mindestens 10 Zeichen haben',400)
    return email.strip().lower(),password

def nickname(value):
    if not isinstance(value,str):raise CaptureError('Spitzname erforderlich',400)
    value=' '.join(unicodedata.normalize('NFKC',value).split())
    if not 3<=len(value)<=24 or not all(c.isalnum() or c in ' _-' for c in value):
        raise CaptureError('Spitzname: 3 bis 24 Buchstaben, Ziffern, Leerzeichen, _ oder -',400)
    return value,value.casefold()

def password_hash(password,salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode('utf8'),salt,ITERATIONS)

class AccountStore:
    def __init__(self,capture):
        self.capture=capture
        self.rate_lock=threading.Lock();self.attempts={};self.kdf=threading.BoundedSemaphore(3)
        with capture.tx() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS game_accounts(
              player TEXT PRIMARY KEY REFERENCES players(id), email TEXT UNIQUE NOT NULL,
              nickname TEXT NOT NULL,nickname_key TEXT UNIQUE NOT NULL,
              salt BLOB NOT NULL,password_hash BLOB NOT NULL,
              room_slot INTEGER UNIQUE NOT NULL CHECK(room_slot>=0),
              avatar TEXT NOT NULL,created REAL NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS game_account_sessions(
              secret TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES game_accounts(player),
              created REAL NOT NULL,expires REAL NOT NULL)""")
            db.execute('CREATE INDEX IF NOT EXISTS game_account_sessions_player ON game_account_sessions(player)')
    def limit(self,ip):
        now=time.monotonic()
        with self.rate_lock:
            self.attempts={k:v for k,v in self.attempts.items() if now-v[0]<60}
            if ip not in self.attempts and len(self.attempts)>=2048:raise CaptureError('Zu viele Anmeldeversuche',429)
            start,n=self.attempts.get(ip,(now,0))
            if n>=12:raise CaptureError('Zu viele Anmeldeversuche. Bitte spaeter erneut versuchen.',429)
            self.attempts[ip]=(start,n+1)
    def derive(self,password,salt):
        if not self.kdf.acquire(blocking=False):raise CaptureError('Anmeldung ausgelastet. Bitte erneut versuchen.',429)
        try:return password_hash(password,salt)
        finally:self.kdf.release()
    def issue(self,db,player):
        now=time.time();key=secrets.token_urlsafe(32)
        db.execute('DELETE FROM game_account_sessions WHERE expires<=?',(now,))
        # Keep at most eight active account devices; revoke oldest sessions.
        db.execute('DELETE FROM game_account_sessions WHERE player=? AND secret NOT IN (SELECT secret FROM game_account_sessions WHERE player=? ORDER BY created DESC LIMIT 7)',(player,player))
        db.execute('INSERT INTO game_account_sessions VALUES(?,?,?,?)',(digest(key),player,now,now+SESSION_TTL))
        return key
    def register(self,data,guest,ip):
        self.limit(ip);email,password=credentials(data.get('email'),data.get('password'),True)
        name,namekey=nickname(data.get('nickname'))
        old=self.capture.identify(guest)
        salt=secrets.token_bytes(16);pw=self.derive(password,salt)
        try:
            with self.capture.tx() as db:
                if db.execute('SELECT 1 FROM game_accounts WHERE email=? OR nickname_key=?',(email,namekey)).fetchone():
                    raise CaptureError('E-Mail oder Spitzname bereits vergeben',409)
                slots={r[0] for r in db.execute('SELECT room_slot FROM game_accounts')}
                slot=next((i for i in range(CAPACITY) if i not in slots),None)
                if slot is None:raise CaptureError('Das Hotel ist voll',409)
                player=old
                if player and db.execute('SELECT 1 FROM game_accounts WHERE player=?',(player,)).fetchone():
                    player=None
                if not player:
                    if db.execute('SELECT count(*) FROM players').fetchone()[0]>=MAX_PLAYERS:raise CaptureError('Spielerkontingent erreicht',429)
                    player=uuid.uuid4().hex
                    db.execute('INSERT INTO players(id,secret,created) VALUES(?,?,?)',(player,digest(secrets.token_urlsafe(32)),time.time()))
                db.execute('INSERT INTO game_accounts VALUES(?,?,?,?,?,?,?,?,?)',(player,email,name,namekey,salt,pw,slot,json.dumps(DEFAULT_AVATAR,separators=(',',':')),time.time()))
                key=self.issue(db,player)
        except sqlite3.IntegrityError as exc:raise CaptureError('Konto konnte nicht angelegt werden',409) from exc
        return self.profile(player),key
    def login(self,data,ip):
        self.limit(ip);email,password=credentials(data.get('email'),data.get('password'))
        with self.capture.tx(False) as db:
            row=db.execute('SELECT player,salt,password_hash FROM game_accounts WHERE email=?',(email,)).fetchone()
        candidate=self.derive(password,row['salt'] if row else DUMMY_SALT)
        if not hmac.compare_digest(candidate,row['password_hash'] if row else bytes(32)) or not row:
            raise CaptureError('E-Mail oder Passwort falsch',401)
        with self.capture.tx() as db:key=self.issue(db,row['player'])
        return self.profile(row['player']),key
    def identify(self,key):
        if not isinstance(key,str) or not TOKEN.fullmatch(key):return None
        with self.capture.tx(False) as db:
            row=db.execute('SELECT player FROM game_account_sessions WHERE secret=? AND expires>?',(digest(key),time.time())).fetchone()
            return row['player'] if row else None
    def logout(self,key):
        if isinstance(key,str) and TOKEN.fullmatch(key):
            with self.capture.tx() as db:db.execute('DELETE FROM game_account_sessions WHERE secret=?',(digest(key),))
    def profile(self,player):
        with self.capture.tx(False) as db:
            r=db.execute('SELECT nickname,room_slot,avatar FROM game_accounts WHERE player=?',(player,)).fetchone()
        if not r:raise CaptureError('Bitte anmelden',401)
        return {'nickname':r['nickname'],'slot':r['room_slot'],'avatar':json.loads(r['avatar'])}
    def directory(self):
        with self.capture.tx(False) as db:
            return [{'slot':r[0],'nickname':r[1]} for r in db.execute('SELECT room_slot,nickname FROM game_accounts ORDER BY room_slot')]
    def paired_neighbor(self,player):
        with self.capture.tx(False) as db:
            own=db.execute('SELECT room_slot FROM game_accounts WHERE player=?',(player,)).fetchone()
            if not own:return None
            slot=own[0]^1
            row=db.execute('SELECT player,room_slot FROM game_accounts WHERE room_slot=?',(slot,)).fetchone()
            return (row[0],row[1]) if row else None
    def save_avatar(self,player,value):
        avatar=clean_avatar(value)
        with self.capture.tx() as db:db.execute('UPDATE game_accounts SET avatar=? WHERE player=?',(json.dumps(avatar,separators=(',',':')),player))
        return self.profile(player)
