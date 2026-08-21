import{useEffect,useState}from"react";
import{Clock,Pencil,Plus,Save,Trash2,X}from"lucide-react";
import{supabase}from"../supabase";

const WEEKDAYS=["월","화","수","목","금","토","일"];
const EMPTY_FORM={title:"",weekdays:[],start_time:"20:30",end_time:"21:30",is_active:true};

function cleanTime(value=""){
  return value.slice(0,5);
}

function normalizeSchedule(schedule){
  return{...schedule,start_time:cleanTime(schedule.start_time),end_time:cleanTime(schedule.end_time)};
}

export function ScheduleManager({session,onSchedulesChange}){
  const[schedules,setSchedules]=useState([]);
  const[form,setForm]=useState(EMPTY_FORM);
  const[editingId,setEditingId]=useState(null);
  const[formOpen,setFormOpen]=useState(false);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[deleteConfirmId,setDeleteConfirmId]=useState(null);
  const[message,setMessage]=useState("");

  useEffect(()=>{
    let active=true;
    async function loadSchedules(){
      setLoading(true);setMessage("");
      const{data,error}=await supabase.from("reading_schedules").select("id,title,weekdays,start_time,end_time,is_active").eq("user_id",session.user.id).order("start_time");
      if(!active)return;
      if(error){console.error("Schedule load failed",error);setMessage("일정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");setSchedules([]);onSchedulesChange([])}
      else{const next=(data||[]).map(normalizeSchedule);setSchedules(next);onSchedulesChange(next)}
      setLoading(false);
    }
    loadSchedules();
    return()=>{active=false};
  },[session.user.id,onSchedulesChange]);

  function openNew(){
    setEditingId(null);setForm(EMPTY_FORM);setFormOpen(true);setMessage("");setDeleteConfirmId(null);
  }

  function openEdit(schedule){
    setEditingId(schedule.id);setForm(normalizeSchedule(schedule));setFormOpen(true);setMessage("");setDeleteConfirmId(null);
  }

  function closeForm(){
    setEditingId(null);setForm(EMPTY_FORM);setFormOpen(false);setMessage("");
  }

  function toggleWeekday(index){
    setForm(current=>({...current,weekdays:current.weekdays.includes(index)?current.weekdays.filter(day=>day!==index):[...current.weekdays,index].sort()}));
  }

  async function saveSchedule(event){
    event.preventDefault();
    const title=form.title.trim();
    if(!title){setMessage("일정 이름을 입력해주세요.");return;}
    if(!form.weekdays.length){setMessage("반복할 요일을 하나 이상 선택해주세요.");return;}
    if(form.end_time<=form.start_time){setMessage("끝나는 시간은 시작 시간보다 늦어야 해요.");return;}
    setSaving(true);setMessage("");
    const payload={user_id:session.user.id,title,weekdays:form.weekdays,start_time:form.start_time,end_time:form.end_time,is_active:form.is_active};
    try{
      const query=editingId
        ?supabase.from("reading_schedules").update(payload).eq("id",editingId).eq("user_id",session.user.id)
        :supabase.from("reading_schedules").insert(payload);
      const{data,error}=await query.select("id,title,weekdays,start_time,end_time,is_active").single();
      if(error)throw error;
      const saved=normalizeSchedule(data);
      const next=editingId?schedules.map(item=>item.id===editingId?saved:item):[...schedules,saved];
      next.sort((a,b)=>a.start_time.localeCompare(b.start_time));
      setSchedules(next);onSchedulesChange(next);setFormOpen(false);setEditingId(null);setForm(EMPTY_FORM);setMessage("일정을 저장했어요.");
    }catch(error){console.error("Schedule save failed",error);setMessage("일정을 저장하지 못했어요. 잠시 후 다시 시도해주세요.")}
    finally{setSaving(false)}
  }

  async function deleteSchedule(id){
    if(deleteConfirmId!==id){setDeleteConfirmId(id);return;}
    setSaving(true);setMessage("");
    const{error}=await supabase.from("reading_schedules").delete().eq("id",id).eq("user_id",session.user.id);
    if(error){console.error("Schedule delete failed",error);setMessage("일정을 삭제하지 못했어요.")}
    else{const next=schedules.filter(item=>item.id!==id);setSchedules(next);onSchedulesChange(next);setMessage("일정을 삭제했어요.")}
    setDeleteConfirmId(null);setSaving(false);
  }

  return <section className="scheduleManager" aria-labelledby="schedule-manager-title">
    <div className="scheduleManagerHead"><div><small>MY JJOKGO DIARY</small><h3 id="schedule-manager-title">내 일정 관리</h3></div><button type="button" className="scheduleAddButton" onClick={openNew}><Plus/> 일정 등록</button></div>
    {message&&<div className="scheduleMessage" role="status">{message}</div>}
    {formOpen&&<form className="scheduleForm" onSubmit={saveSchedule}>
      <div className="scheduleFormTitle"><strong>{editingId?"일정 수정":"새 일정"}</strong><button type="button" onClick={closeForm} aria-label="일정 편집 닫기"><X/></button></div>
      <label>일정 이름<input required maxLength="80" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="예: 아이들과 함께 읽기"/></label>
      <fieldset><legend>반복 요일</legend><div className="weekdayPicker">{WEEKDAYS.map((day,index)=><button type="button" key={day} className={form.weekdays.includes(index)?"selected":""} aria-pressed={form.weekdays.includes(index)} onClick={()=>toggleWeekday(index)}>{day}</button>)}</div></fieldset>
      <div className="scheduleTimeFields"><label>시작 시간<input type="time" required value={form.start_time} onChange={event=>setForm({...form,start_time:event.target.value})}/></label><span>—</span><label>종료 시간<input type="time" required value={form.end_time} onChange={event=>setForm({...form,end_time:event.target.value})}/></label></div>
      <label className="scheduleActive"><input type="checkbox" checked={form.is_active} onChange={event=>setForm({...form,is_active:event.target.checked})}/> 캘린더에 이 일정 표시</label>
      <div className="scheduleFormActions"><button type="button" onClick={closeForm}>취소</button><button disabled={saving}><Save/> {saving?"저장 중…":"저장"}</button></div>
    </form>}
    {loading?<div className="scheduleEmpty">일정을 불러오는 중…</div>:schedules.length===0?<div className="scheduleEmpty"><Clock/><b>등록된 일정이 없어요</b><small>정기 독서 시간을 등록하면 달력에서 바로 확인할 수 있어요.</small><button type="button" onClick={openNew}><Plus/> 첫 일정 등록</button></div>:<div className="scheduleList">{schedules.map(schedule=><article className={`managedSchedule ${schedule.is_active?"":"inactive"}`} key={schedule.id}>
      <div className="scheduleWhen"><small>{schedule.is_active?"EVERY WEEK":"PAUSED"}</small><b>{schedule.start_time}—{schedule.end_time}</b></div>
      <div className="scheduleDetail"><span className="scheduleType">{schedule.is_active?"정기 일정":"표시 안 함"}</span><strong>{schedule.title}</strong><div className="scheduleDays" aria-label={schedule.weekdays.map(day=>`${WEEKDAYS[day]}요일`).join(", ")}>{schedule.weekdays.map(day=><i key={day}>{WEEKDAYS[day]}</i>)}</div></div>
      <div className="scheduleItemActions"><button type="button" onClick={()=>openEdit(schedule)} aria-label={`${schedule.title} 수정`}><Pencil/> 수정</button><button type="button" className={deleteConfirmId===schedule.id?"confirmDelete":""} onClick={()=>deleteSchedule(schedule.id)} disabled={saving} aria-label={`${schedule.title} 삭제`}><Trash2/> {deleteConfirmId===schedule.id?"정말 삭제":"삭제"}</button>{deleteConfirmId===schedule.id&&<button type="button" onClick={()=>setDeleteConfirmId(null)}>취소</button>}</div>
    </article>)}</div>}
  </section>;
}
