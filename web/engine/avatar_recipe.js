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
  modifiers:{'head/head-oval':a.face===0?.6:0,'head/head-square':a.face===1?.45:0,'head/head-round':a.face===2?.65:0},
  skin:a.skin>=4?(a.body===3?'young_african_female':'young_african_male'):(a.body===3?'young_caucasian_female':'young_caucasian_male'),
  skinTint:['#ffffff','#efdfd1','#d4b79e','#b8a58a','#f1ded0','#bba18b'][a.skin],
  eyes:['brown','brownlight','green','blue','grey'][a.eyes],eyebrows:'eyebrow001',eyelashes:'eyelashes01',
  hair:['short01','short02','bob01','afro01','ponytail01','none'][a.hair],
  hairColor:hex('hairColor'),hairTint:['#262321','#503b32','#79523b','#ffffff','#ba7751','#e4e4e4'][a.hairColor],
  facialHair:['none','stubble','short_beard'][a.beard],beardColor:hex('hairColor'),
  outfit:'none',top,jacket,bottom,shoes,hat:'none',underwear:true,
  accessories:a.glasses===1?['aviators']:a.glasses===2?['sunglasses_sleek']:[],
  garmentStyles:{[top]:{pattern:'solid',color:colors.top},[bottom]:{pattern:'solid',color:colors.bottom},...(jacket==='none'?{}:{[jacket]:{pattern:'solid',color:colors.jacket}})},
  rig:'game',restPose:'A'};
 return {params,colors};
}
