import('./game.js').catch(error=>{
  console.error(error);
  document.getElementById('assetstatus').textContent='Die Grafik-Engine konnte nicht gestartet werden. Bitte Docker-Image neu bauen und WebGL 2 prüfen.';
  document.getElementById('start').disabled=true;
});
