import{supabase}from"../supabase";

function cleanTime(value=""){
  return value.slice(0,5);
}

export function normalizeSchedule(schedule){
  return{...schedule,start_time:cleanTime(schedule.start_time),end_time:cleanTime(schedule.end_time)};
}

export function sortSchedules(schedules){
  return[...schedules].sort((a,b)=>{
    const firstDayA=Math.min(...(a.weekdays?.length?a.weekdays:[7]));
    const firstDayB=Math.min(...(b.weekdays?.length?b.weekdays:[7]));
    return firstDayA-firstDayB||a.start_time.localeCompare(b.start_time)||a.title.localeCompare(b.title,"ko");
  });
}

export async function fetchReadingSchedules(userId){
  if(!userId)return[];
  const{data,error}=await supabase
    .from("reading_schedules")
    .select("id,title,weekdays,start_time,end_time,is_active")
    .eq("user_id",userId);
  if(error)throw error;
  return sortSchedules((data||[]).map(normalizeSchedule));
}
