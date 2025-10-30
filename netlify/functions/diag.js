export default async (req) => {
  try {
    const body = await req.json();
    console.log('[DIAG]', JSON.stringify(body));
  } catch {}
  return new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json'}});
};
