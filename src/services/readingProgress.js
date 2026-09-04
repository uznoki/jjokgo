import {supabase} from "../supabase";

const NUMERIC_FIELDS=["recordings","pagesNarrated","completedBooks","sharedSessions","flowSessions","podcastDrafts","minutesRecorded"];
const EMPTY_PROGRESS={recordings:0,pagesNarrated:0,completedBooks:0,sharedSessions:0,flowSessions:0,podcastDrafts:0,minutesRecorded:0,eventKeys:[]};
let progressSync=Promise.resolve();

function eventFingerprint(value){
  let hash=2166136261;
  for(let index=0;index<value.length;index++)hash=Math.imul(hash^value.charCodeAt(index),16777619);
  return `e${(hash>>>0).toString(36)}`;
}

function normalizeProgress(value={}){
  const progress={...EMPTY_PROGRESS};
  for(const field of NUMERIC_FIELDS)progress[field]=Math.max(0,Number(value?.[field])||0);
  progress.eventKeys=Array.isArray(value?.eventKeys)?value.eventKeys.filter(Boolean).slice(-250):[];
  return progress;
}

function storageKey(session){return `jjokgo-progress:${session?.user?.id||"guest"}`}

function cachedProgress(session){
  try{return normalizeProgress(JSON.parse(localStorage.getItem(storageKey(session))||"{}"))}catch{return normalizeProgress()}
}

export function readReadingProgress(session){
  const remote=normalizeProgress(session?.user?.user_metadata?.jjokgo_progress);
  const local=cachedProgress(session);
  const merged={...EMPTY_PROGRESS,eventKeys:[...new Set([...remote.eventKeys,...local.eventKeys])].slice(-250)};
  for(const field of NUMERIC_FIELDS)merged[field]=Math.max(remote[field],local[field]);
  return merged;
}

export async function recordReadingActivity(session,increments={},eventKey=""){
  if(!session?.user?.id)return readReadingProgress(session);
  const current=readReadingProgress(session);
  const fingerprint=eventKey?eventFingerprint(eventKey):"";
  if(fingerprint&&current.eventKeys.includes(fingerprint))return current;
  const next={...current,eventKeys:fingerprint?[...current.eventKeys,fingerprint].slice(-250):current.eventKeys};
  for(const field of NUMERIC_FIELDS){
    if(increments[field])next[field]=Math.max(0,next[field]+Number(increments[field]||0));
  }
  localStorage.setItem(storageKey(session),JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("jjokgo:progress",{detail:next}));
  progressSync=progressSync.catch(()=>{}).then(async()=>{
    const{error}=await supabase.auth.updateUser({data:{jjokgo_progress:next}});
    if(error)throw error;
  });
  try{await progressSync}catch(error){console.warn("Reading progress sync delayed",error)}
  return next;
}
