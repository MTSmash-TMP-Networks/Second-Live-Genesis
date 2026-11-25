// Translate the existing server-validated avatar choices into an Ara/MakeHuman recipe.
// No player name, email or other account information is used.
export function avatarRecipe(a,options){
 const hex=k=>'#'+options[k].colors[a[k]];
 const top=['oversized_tee','uniform_shirt_long','camp_shirt','oversized_tee'][a.top];
 const jacket=a.top===3?'racing_jacket_long':'none';
 const bottom=['baggy_jeans','suit_trousers','trousers'][a.trousers];
 const shoes=a.shoes===2?'oxfords':'sneakers';
 const colors={top:a.top===3?'#85878d':hex('topColor'),jacket:hex('topColor'),bottom:hex('trousersColor'),shoes:['#eeeeea','#272a2e','#4c382d'][a.shoes]};
 const params={name:'Second Live',seed:3417,gender:a.body===3?.15:1,ageYears:30,
  muscle:[.23,.66,.50,.38][a.body],weight:[.28,.48,.78,.58][a.body],height:[.33,.5,.67][a.height],proportions:.65,
  african:[0,0,.1,.22,.7,.9][a.skin],asian:[0,0,.15,.25,.1,.05][a.skin],caucasian:[1,1,.75,.53,.2,.05][a.skin],
  modifiers:{'head/head-square':a.face===1?.45:0,'head/head-fat':a.face===2?.42:a.face===0?-.2:0},
  skin:'auto',
  skinTint:['#ffffff','#efdfd1','#d4b79e','#b8a58a','#f1ded0','#bba18b'][a.skin],
  eyes:['brown','brownlight','green','lightblue','grey'][a.eyes],eyebrows:'eyebrow001',eyelashes:'eyelashes01',
  hair:['short01','short02','bob01','afro01','ponytail01','none'][a.hair],
  hairColor:hex('hairColor'),hairTint:['#262321','#503b32','#79523b','#ffffff','#ba7751','#e4e4e4'][a.hairColor],
  facialHair:['none','stubble','short_beard'][a.beard],beardColor:hex('hairColor'),
  outfit:'none',top,jacket,bottom,shoes,hat:'none',underwear:true,
  accessories:a.glasses===1?['aviators']:a.glasses===2?['sunglasses_sleek']:[],
  garmentStyles:{[top]:{color:colors.top},[bottom]:{color:colors.bottom},[shoes]:{color:colors.shoes},...(jacket==='none'?{}:{[jacket]:{color:colors.jacket,color2:colors.jacket}})},
  rig:'game',restPose:'A'};
 return {params,colors};
}

// Resolve against the exact pinned npm schema. Leave fabric patterns to each garment's defaults.
export function resolveAvatarRecipe(recipe,schema){
 const rules=schema?.properties?.params?.properties;
 if(!rules?.top?.enum||!rules?.garmentStyles?.propertyNames?.enum)throw Error('Invalid pinned avatar schema');
 const p=JSON.parse(JSON.stringify(recipe.params)),colors=recipe.colors;
 const aliases={
  top:{oversized_tee:['oversized_tee','tank_top','camp_shirt'],uniform_shirt_long:['uniform_shirt_long','camp_shirt','oversized_tee'],camp_shirt:['camp_shirt','uniform_camp_shirt','uniform_shirt_long']},
  jacket:{racing_jacket_long:['racing_jacket_long','racing_jacket','suit_jacket']},
  bottom:{baggy_jeans:['baggy_jeans','cargo_pants','suit_trousers'],suit_trousers:['suit_trousers','uniform_trousers','cargo_pants'],trousers:['trousers','cargo_pants','suit_trousers']},
  shoes:{sneakers:['sneakers','shoes01','shoes02'],oxfords:['oxfords','loafers','shoes03']},
  hair:{short01:['short01','short03','short02','buzz'],short02:['short02','short04','short01'],bob01:['bob01','bob02','long01'],afro01:['afro01','box_braids','cornrows'],ponytail01:['ponytail01','braid01','long01']},
  eyes:{brown:['brown','darkbrown','brownlight'],brownlight:['brownlight','brown'],green:['green','grey'],lightblue:['lightblue','blue','ice'],grey:['grey','ice','lightblue']},
  eyebrows:{eyebrow001:['eyebrow001','none']},eyelashes:{eyelashes01:['eyelashes01','none']}
 };
 for(const [key,value] of Object.entries(p)){
  if(!rules[key]){delete p[key];continue;}
  const allowed=rules[key].enum;
  if(allowed&&!allowed.includes(value)){
   const replacement=(aliases[key]?.[value]||[]).find(v=>allowed.includes(v));
   if(replacement!==undefined)p[key]=replacement;
   else if(['skin','eyebrows','eyelashes','hat','facialHair'].includes(key)&&allowed.includes(key==='skin'?'auto':'none'))p[key]=key==='skin'?'auto':'none';
   else throw Error('Unsupported avatar option '+key+': '+value);
  }
 }
 const mods=rules.modifiers?.properties||{};
 p.modifiers=Object.fromEntries(Object.entries(p.modifiers||{}).filter(([key])=>mods[key]).map(([key,value])=>[key,Math.max(mods[key].minimum??-1,Math.min(mods[key].maximum??1,value))]));
 const acc=rules.accessories?.items?.enum||[];
 p.accessories=(p.accessories||[]).map(id=>{
  if(acc.includes(id))return id;
  const choices=id==='aviators'?['round_glasses','glasses','aviators']:['sunglasses_sleek','sunglasses','square_glasses','aviators'];
  return choices.find(x=>acc.includes(x))||acc.find(x=>/glasses|aviator/i.test(x));
 }).filter(Boolean);
 p.accessories=[...new Set(p.accessories)];
 const garments=new Set(rules.garmentStyles.propertyNames.enum);
 p.garmentStyles={};
 for(const [slot,color] of Object.entries(colors)){
  const id=p[slot];if(id&&id!=='none'&&garments.has(id))p.garmentStyles[id]={color,...(slot==='jacket'?{color2:color}:{})};
 }
 if(p.outfit!=='none'||p.top==='none'||p.bottom==='none'||p.shoes==='none'||p.underwear!==true||p.rig!=='game')throw Error('Incomplete dressed avatar');
 return {kind:'ara-character',version:1,params:p};
}
export function standardProfiles(options){
 const current=Object.fromEntries(Object.entries(options).map(([k,v])=>[k,v.default]));
 return {standard:current,classic:{...current,face:0,hair:1,top:0,topColor:2,trousersColor:0,beard:0}};
}
