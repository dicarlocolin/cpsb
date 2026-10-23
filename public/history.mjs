export function totalImageHistory(chart) {
  const count = Math.max(0, (chart.cols?.length || 0) - 1);
  const latest = Array(count).fill(null);
  return (chart.rows || []).map(row => {
    if (!count) return null;
    // After an image first reports, retain its last score when it stops
    // reporting. Never fill its score backwards into times before it joined.
    for(let i=0;i<count;i++){
      const value=row.c[i+1]?.v;
      if(value!=null && value!=='null' && value!=='' && Number.isFinite(Number(value))) latest[i]=Number(value);
    }
    const values=latest.filter(value=>value!==null);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + Number(value), 0);
  });
}
