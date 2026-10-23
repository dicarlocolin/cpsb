function totalVulns(images) {
  if(!Array.isArray(images)) throw Error('Invalid image statistics');
  const sum=field=>{
    const values=images.map(image=>image[field]);
    if(values.some(value=>value==null || value==='' || value==='null' || !Number.isFinite(Number(value)))) return null;
    return values.reduce((total,value)=>total+Number(value),0);
  };
  return {found:sum('found'),remaining:sum('remaining')};
}
module.exports={totalVulns};
