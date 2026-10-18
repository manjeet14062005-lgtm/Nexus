function queueOptions(query={}) {
 const status=String(query.status||'pending').trim().toLowerCase(),page=Number(query.page||0);
 if(!['pending','processing','blocked','failed','completed','canceled'].includes(status)||!Number.isInteger(page)||page<0||page>100000)throw Object.assign(new Error('Invalid queue filter.'),{status:400});
 return {status,page};
}
async function readDeletionQueue(client,query) {
 const {status,page}=queueOptions(query);
 const {data,error,count}=await client.from('nexus_documents').select('doc_id,data',{count:'exact'}).eq('collection_name','accountDeletionRequests').eq('data->>status',status).order('created_at',{ascending:false}).order('id').range(page*30,page*30+29);
 if(error)throw error;
 const requests=(data||[]).map(row=>({uid:row.data?.uid||row.doc_id,email:row.data?.email||null,status:row.data?.status,executeAfter:row.data?.executeAfter||null}));
 return {success:true,status,requests,total:count,hasMore:(page+1)*30<count};
}
module.exports={queueOptions,readDeletionQueue};
