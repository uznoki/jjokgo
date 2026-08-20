import {createClient} from "@supabase/supabase-js";
import {AccessToken} from "livekit-server-sdk";

function json(response,status,body){
  response.status(status).setHeader("Content-Type","application/json");
  response.setHeader("Cache-Control","no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request,response){
  if(request.method!=="POST")return json(response,405,{error:"METHOD_NOT_ALLOWED"});

  const livekitUrl=process.env.LIVEKIT_URL;
  const livekitApiKey=process.env.LIVEKIT_API_KEY;
  const livekitApiSecret=process.env.LIVEKIT_API_SECRET;
  const supabaseUrl=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!livekitUrl||!livekitApiKey||!livekitApiSecret||!supabaseUrl||!supabaseKey){
    return json(response,503,{error:"LIVEKIT_NOT_CONFIGURED"});
  }

  const authorization=request.headers.authorization||"";
  const accessToken=authorization.startsWith("Bearer ")?authorization.slice(7):"";
  const roomId=String(request.body?.roomId||"").trim();
  const connectionId=String(request.body?.connectionId||"").trim();
  if(!accessToken)return json(response,401,{error:"AUTH_REQUIRED"});
  if(!roomId||roomId.length>128||!/^[a-zA-Z0-9_-]+$/.test(roomId)){
    return json(response,400,{error:"INVALID_ROOM_ID"});
  }
  if(!connectionId||connectionId.length>128||!/^[a-zA-Z0-9_-]+$/.test(connectionId)){
    return json(response,400,{error:"INVALID_CONNECTION_ID"});
  }

  const supabase=createClient(supabaseUrl,supabaseKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${accessToken}`}}
  });
  const {data:userData,error:userError}=await supabase.auth.getUser(accessToken);
  if(userError||!userData.user)return json(response,401,{error:"INVALID_SESSION"});

  const {data:membership,error:membershipError}=await supabase
    .from("reading_room_members")
    .select("room_id")
    .eq("room_id",roomId)
    .eq("user_id",userData.user.id)
    .maybeSingle();
  if(membershipError||!membership)return json(response,403,{error:"ROOM_ACCESS_DENIED"});

  const nickname=String(userData.user.user_metadata?.nickname||userData.user.email?.split("@")[0]||"쪽GO 참여자").slice(0,80);
  const token=new AccessToken(livekitApiKey,livekitApiSecret,{
    identity:`${userData.user.id}-${connectionId}`,
    name:nickname,
    ttl:"1h"
  });
  token.addGrant({
    roomJoin:true,
    room:`jjokgo-${roomId}`,
    canPublish:true,
    canSubscribe:true,
    canPublishData:true
  });

  return json(response,200,{serverUrl:livekitUrl,token:await token.toJwt()});
}
