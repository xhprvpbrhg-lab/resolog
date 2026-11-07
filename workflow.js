/* Inspection → work → review. Existing measurements remain the single source of truth. */
let workflow = emptyWorkflow();
let workflowPhase = 'inspection';
function emptyWorkflow() { return { version: 1, findings: {}, tasks: [] }; }
const wfText = (ja, en) => lang === 'en' ? en : ja;
const wfStates = () => ({uninspected:wfText('未点検','Not inspected'), unnecessary:wfText('点検済み・作業不要','Inspected · no work needed'), planned:wfText('作業予定','Planned'), done:wfText('実施済み','Completed'), deferred:wfText('見送り','Deferred')});
function wfCatalog() {
  const result = [
    {id:'tuning',label:wfText('調律','Tuning')},
    {id:'needling',label:wfText('針入れ','Needling')},
    {id:'hardener',label:wfText('硬化剤塗布','Hardener application')},
    {id:'filing',label:wfText('ファイリング','Hammer filing')},
    {id:'investigate',label:wfText('追加点検','Further inspection')},
    {id:'other',label:wfText('その他の作業','Other work')}
  ];
  const action = getScenes().find(s=>s.id==='action');
  action?.groups.forEach(g=>g.items.forEach(i=>result.push({id:'action.'+i.id,label:iLabel(i)})));
  return result;
}
function wfSources() {
  return [{id:'pitch',label:wfText('ピッチ・調律状態','Pitch / tuning condition')},
    ...getEvalSliders().map(i=>({id:'eval.'+i.key,label:i.label,key:i.key})),
    {id:'unaCorda',label:'Una corda'}, {id:'pedal',label:wfText('ペダル','Pedals')},
    ...wfMeasures().map(i=>({id:'action.'+i.id,label:iLabel(i)}))];
}
function wfMeasures() { return getScenes().find(s=>s.id==='action')?.groups.flatMap(g=>g.items).filter(i=>i.hasMm||i.hasMeasure)||[]; }
function wfFinding(id) { return workflow.findings[id] ||= {state:'uninspected',note:'',result:''}; }
function wfLabel(id) { return wfSources().find(s=>s.id===id)?.label || id; }
function wfTaskLabel(task) { return wfCatalog().find(s=>s.id===task.kind)?.label || task.kind; }
function wfKey(n) { return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1); }
function wfTarget(target) {
  if (!target || target.mode==='unspecified') return '';
  if (target.mode==='all') return wfText('全域','All keys');
  if (target.mode==='zones') return (target.zones||[]).map(z=>({bass:t('zoneBass'),mid:t('zoneMid'),treble:t('zoneTreble')})[z]).join('・');
  const keys = [...new Set(target.keys||[])].filter(n=>Number.isInteger(n)&&n>=21&&n<=108).sort((a,b)=>a-b);
  return target.mode==='range' && keys.length ? wfKey(keys[0])+'–'+wfKey(keys[keys.length-1]) : keys.map(wfKey).join(', ');
}
function wfTaskText(task) { return [wfTaskLabel(task),wfTarget(task.target),task.memo].filter(Boolean).join(' / '); }
function wfSelect(options,value,attrs='') { return `<select ${attrs}>${Object.entries(options).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select>`; }
function wfInput(value,attrs='') { return `<input value="${esc(String(value??''))}" ${attrs}>`; }
function wfField(label,control) { return `<label class="wf-field"><span>${esc(label)}</span>${control}</label>`; }
function wfChanged() { markDirty(); }
function wfSyncLegacy() { restoreChecklistUI(); restoreTuningUI(); restoreEvalForm(); }
function wfDecision(id) {
  const f=wfFinding(id);
  return wfSelect({uninspected:wfStates().uninspected,unnecessary:wfStates().unnecessary,needed:wfText('点検済み・作業を検討','Inspected · consider work')},f.state,`data-decision="${esc(id)}" aria-label="${esc(wfLabel(id))} ${wfText('判断','decision')}"`);
}
function wfPlanControls(id) {
  const choices=wfCatalog();
  return `<details class="wf-plan-options"><summary>${wfText('作業を予定・関連づけ','Plan / link work')}</summary><div class="wf-plan"><select data-kind="${esc(id)}" aria-label="${esc(wfLabel(id))} ${wfText('予定作業','work type')}">${choices.map(c=>`<option value="${c.id}" ${c.id===(id==='pitch'?'tuning':id.startsWith('action.')?id:'needling')?'selected':''}>${esc(c.label)}</option>`).join('')}</select><button type="button" data-plan="${esc(id)}">${wfText('予定に追加','Plan work')}</button></div>
    ${workflow.tasks.length?`<div class="wf-plan"><select data-existing="${esc(id)}" aria-label="${wfText('既存作業','Existing task')}">${workflow.tasks.map(task=>`<option value="${esc(task.id)}">${esc(wfTaskText(task))} · ${wfStates()[task.status]}</option>`).join('')}</select><button type="button" data-link="${esc(id)}">${wfText('既存作業に関連づけ','Link existing')}</button></div>`:''}
    <div class="wf-muted">${workflow.tasks.filter(task=>task.sources.includes(id)).map(task=>esc(wfTaskLabel(task))+' · '+wfStates()[task.status]).join(' / ')}</div></details>`;
}
function wfMeasurement(item,phase) {
  const st=checklist.action?.[item.id]||{};
  const zones=item.hasMm?['bass','mid','treble']:['single'];
  return zones.map(z=>{
    const val=z==='single'?st[phase]:st.mm?.[z]?.[phase];
    const before=z==='single'?st.before:st.mm?.[z]?.before;
    return wfField(z==='single'?'mm':({bass:t('zoneBass'),mid:t('zoneMid'),treble:t('zoneTreble')})[z],
      (phase==='after'?`<small>${wfText('前','Before')}: ${esc(before||'—')}</small>`:'')+
      wfInput(val,`type="number" step="any" inputmode="decimal" placeholder="—" data-measure="${item.id}" data-zone="${z}" data-phase="${phase}" aria-label="${esc(iLabel(item))} ${z} ${phase}"`));
  }).join('');
}
function wfRenderInspectionOrReview(review) {
  const phase=review?'after':'before';
  let html=`<p class="wf-muted">${review?wfText('作業前の状態と比較して結果を記録します。','Compare with the inspection and record results.'):wfText('測定や評価だけでも保存できます。必要な作業だけ予定に追加します。','Save observations without scheduling work. Add only the work you need.')}</p>`;
  html+=`<section class="wf-section"><h3>${wfText('ピッチ・調律状態','Pitch / tuning condition')}</h3>${review?`<p>${wfText('調律前','Before')}: ${esc(tuningData.pitchBefore||'—')} Hz</p>`:''}
    ${wfField(review?wfText('調律後ピッチ (Hz)','Pitch after (Hz)'):wfText('調律前ピッチ (Hz)','Pitch before (Hz)'),wfInput(tuningData[review?'pitchAfter':'pitchBefore'],`type="number" step="any" inputmode="decimal" data-pitch="${review?'pitchAfter':'pitchBefore'}"`))}
    ${wfField(wfText('状態・コメント','Condition / comment'),wfInput(tuningData[review?'postComment':'preCondition'],`data-tuning="${review?'postComment':'preCondition'}"`))}
    ${review?'':wfDecision('pitch')+wfPlanControls('pitch')}</section>`;
  html+=`<section class="wf-section"><h3>${wfText('音・タッチ評価','Sound / touch')}</h3>`;
  [...getEvalSliders().map(i=>({id:'eval.'+i.key,...i})),{id:'unaCorda',label:'Una corda'}].forEach(s=>{
    const f=wfFinding(s.id),ev=s.key?evaluation[s.key]:null;
    html+=`<div class="wf-observation"><strong>${esc(s.label)}</strong>${s.hint?`<small class="wf-muted">${esc(s.hint)}</small>`:''}`;
    if (ev) html+=`${review?`<span>${wfText('前','Before')}: ${ev.before??3} → </span>`:''}<output>${ev[phase]??3}</output>${wfInput(ev[phase]??3,`type="range" min="1" max="5" data-eval="${s.key}" data-phase="${phase}" aria-label="${esc(s.label)} ${phase}"`)}`;
    html+=wfField(review?wfText('結果・変化','Result / change'):wfText('点検時の状態','Initial condition'),wfInput(review?(s.key?evaluation[s.key]?.memo:f.result):f.note,`data-finding="${s.id}" data-field="${review?'result':'note'}"`));
    if(review && f.note) html+=`<p class="wf-muted">${wfText('点検','Inspection')}: ${esc(f.note)}</p>`;
    html+=review?wfLinksEditor(s.id):wfDecision(s.id)+wfPlanControls(s.id);
    html+='</div>';
  });
  html+='</section>';
  html+=`<section class="wf-section"><h3>${wfText('ウェイト測定 (g)','Touch weight (g)')}</h3><div class="wf-measures">${['DW','UW'].map(k=>wfField(k,(review?`<small>${wfText('前','Before')}: ${esc(touchData['inspection'+k]||'—')}</small>`:'')+wfInput(touchData[(review?'final':'inspection')+k],`type="number" step="any" inputmode="decimal" data-touch="${(review?'final':'inspection')+k}"`))).join('')}</div><p id="wf-weight-result">${wfWeightText(review?'final':'inspection')}</p></section>`;
  html+=`<section class="wf-section"><h3>${wfText('整調寸法 (mm)','Regulation measurements (mm)')}</h3><div class="wf-muted">${wfText('入力しても実施済みにはなりません。','Entering measurements does not mark work completed.')}</div>`;
  wfMeasures().forEach(item=>{
    html+=`<div class="wf-observation"><strong>${esc(iLabel(item))}</strong><div class="wf-measures">${wfMeasurement(item,phase)}</div>`;
    if(!review) html+=wfDecision('action.'+item.id)+wfPlanControls('action.'+item.id);
    html+='</div>';
  });
  html+='</section>';
  const f=wfFinding('pedal');
  html+=`<section class="wf-section"><h3>${wfText('ペダル','Pedals')}</h3>${review&&f.note?`<p>${esc(f.note)}</p>`:''}${wfField(review?wfText('確認結果','Result'):wfText('点検時の状態','Initial condition'),wfInput(review?f.result:f.note,`data-finding="pedal" data-field="${review?'result':'note'}"`))}${review?wfLinksEditor('pedal'):wfDecision('pedal')+wfPlanControls('pedal')}</section>`;
  if(review) html+=`<section class="wf-section"><h3>${wfText('フィードバック','Feedback')}</h3>${['positive','negative'].map(k=>wfField(k==='positive'?wfText('肯定的コメント','Positive comments'):wfText('要望・改善点','Requests / improvements'),wfInput(evaluation[k],`data-feedback="${k}"`))).join('')}${wfSelect({'':wfText('未評価','Not rated'),none:wfText('コメントなし','No comment'),satisfied:wfText('満足','Satisfied'),'needs-improvement':wfText('要改善','Needs improvement')},evaluation.overall,'data-overall="true" aria-label="Overall rating"')}</section>`;
  return html;
}
function wfWeightText(phase) {
  const dw=touchData[phase+'DW'],uw=touchData[phase+'UW'];
  if(dw===''||uw===''||dw==null||uw==null)return 'BW / Friction: —';
  if(+dw<+uw||+uw<0)return wfText('ウェイト値を確認してください','Check the weight values');
  const bw=(+dw + +uw)/2,fr=(+dw - +uw)/2;
  return `BW: ${bw} g (${getBalanceWeightRating(bw)[lang==='en'?'en':'ja']}) / Friction: ${fr} g (${getFrictionRating(fr)[lang==='en'?'en':'ja']})`;
}
function wfLinksEditor(id) {
  return `<fieldset class="wf-links"><legend>${wfText('関連作業（複数選択可）','Related work (optional)')}</legend>${workflow.tasks.map(task=>`<label><input type="checkbox" data-task-link="${esc(task.id)}" data-source="${id}" ${task.sources.includes(id)?'checked':''}> ${esc(wfTaskText(task))} · ${wfStates()[task.status]}</label>`).join('')||`<span class="wf-muted">${wfText('作業はまだありません','No tasks yet')}</span>`}</fieldset>`;
}
function wfTargetEditor(task) {
  const target=task.target||{mode:'unspecified',keys:[],zones:[]};
  let html=wfSelect({unspecified:wfText('対象未指定','Unspecified'),all:wfText('全域','All keys'),zones:wfText('大まかな音域','Registers'),range:wfText('連続範囲','Key range'),keys:wfText('個別キー','Individual keys')},target.mode,`data-target-mode="${task.id}" aria-label="${wfText('対象の指定方法','Target mode')}"`);
  if(target.mode==='zones') html+=['bass','mid','treble'].map(z=>`<label><input type="checkbox" data-zone-task="${task.id}" value="${z}" ${(target.zones||[]).includes(z)?'checked':''}>${({bass:t('zoneBass'),mid:t('zoneMid'),treble:t('zoneTreble')})[z]}</label>`).join('');
  if(['range','keys'].includes(target.mode)) html+=`<details><summary>${wfText('キーを指定','Choose keys')} · ${esc(wfTarget(target))||'—'}</summary><p class="wf-muted">${target.mode==='range'?wfText('始点、終点の順でタップ。次のタップで新しい範囲を開始。','Tap the start then end. Tap again to start a new range.'):wfText('キーをタップして追加・解除。中央ド = C4。','Tap to toggle keys. Middle C = C4.')}</p><div class="wf-keyboard">${Array.from({length:88},(_,i)=>i+21).map(n=>`<button type="button" class="${wfKey(n).includes('♯')?'black ':''}${(target.keys||[]).includes(n)?'selected':''}" data-key-task="${task.id}" data-key="${n}" aria-pressed="${(target.keys||[]).includes(n)}">${wfKey(n)}</button>`).join('')}</div></details>`;
  return html;
}
function wfRenderTasks() {
  let html=`<div class="wf-plan"><select id="wf-new-kind" aria-label="${wfText('作業の種類','Work type')}">${wfCatalog().map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select><button type="button" data-plan="">${wfText('作業を追加','Add task')}</button></div>`;
  html+=workflow.tasks.map((task,index)=>`<section class="wf-section" data-task="${esc(task.id)}"><h3>${esc(wfTaskLabel(task))}</h3>${wfSelect(Object.fromEntries(['planned','done','deferred'].map(s=>[s,wfStates()[s]])),task.status,`data-task-status="${task.id}" aria-label="${wfText('作業状態','Task status')}"`)}
    <p class="wf-muted">${task.sources.map(wfLabel).map(esc).join(' / ')||wfText('関連する点検なし','No linked inspection')}</p>
    ${task.sources.includes('pitch')?`<p>${wfText('調律前','Before')}: ${esc(tuningData.pitchBefore||'—')} Hz / ${esc(tuningData.preCondition||'')}</p>`:''}
    ${[...new Set([task.kind,...task.sources])].filter(id=>id.startsWith('action.')).map(id=>{const item=wfMeasures().find(i=>'action.'+i.id===id);return item?`<p>${esc(iLabel(item))}: ${esc(wfMeasureText(checklist.action?.[item.id],item))}</p>`:'';}).join('')}
    ${wfTargetEditor(task)}${index?`<button type="button" data-copy-target="${task.id}">${wfText('直前の作業と同じ対象','Use previous target')}</button>`:''}
    ${wfField(wfText('処置内容（部位・深さ・量・薬剤・濃度など）','Treatment (location, depth, amount, agent, concentration)'),`<textarea data-task-memo="${task.id}">${esc(task.memo)}</textarea>`)}
    <details><summary>${wfText('関連する点検・評価','Linked inspections / evaluations')}</summary>${wfSources().map(s=>`<label class="wf-link-row"><input type="checkbox" data-task-link="${task.id}" data-source="${s.id}" ${task.sources.includes(s.id)?'checked':''}> ${esc(s.label)}</label>`).join('')}</details>
    <button type="button" data-delete-task="${task.id}">${wfText('作業を削除','Delete task')}</button></section>`).join('');
  return html;
}
function wfMeasureText(st,item) {
  if(!st)return '';
  return item.hasMm?['bass','mid','treble'].map(z=>`${({bass:t('zoneBass'),mid:t('zoneMid'),treble:t('zoneTreble')})[z]} ${st.mm?.[z]?.before||'—'} → ${st.mm?.[z]?.after||'—'} mm`).join(' / '):`${st.before||'—'} → ${st.after||'—'} mm`;
}
function renderWorkflow() {
  let root=document.getElementById('workflow-card');
  if(!root){root=document.createElement('div');root.id='workflow-card';root.className='card';document.querySelector('#view-new .scenes-card').before(root);}
  root.innerHTML=`<div class="card-title">${wfText('点検・作業・最終確認','Inspection · work · review')}</div><nav class="wf-tabs">${[['inspection',wfText('1 点検','1 Inspect')],['work',wfText('2 作業','2 Work')],['review',wfText('3 最終確認','3 Review')]].map(([id,label])=>`<button type="button" data-wf-phase="${id}" aria-pressed="${id===workflowPhase}">${label}</button>`).join('')}</nav><div id="wf-body">${workflowPhase==='work'?wfRenderTasks():wfRenderInspectionOrReview(workflowPhase==='review')}</div><label class="wf-link-row"><input type="checkbox" id="wf-legacy-toggle" ${document.body.classList.contains('wf-show-legacy')?'checked':''}>${wfText('詳細チェックリスト・既存記録を表示','Show detailed checklist / legacy records')}</label>`;
}
const wfRootInit=initChecklist;
initChecklist=function(){wfRootInit();tuningData.pitchBefore='';tuningData.pitchAfter='';workflow=emptyWorkflow();workflowPhase='inspection';};
const wfBuildScenes=buildScenes;
buildScenes=function(){wfBuildScenes();renderWorkflow();};
const wfPopulate=populateFormForEdit;
populateFormForEdit=function(rec){workflow=JSON.parse(JSON.stringify(rec.workflow||{...emptyWorkflow(),legacy:true}));workflowPhase='inspection';wfPopulate(rec);renderWorkflow();};
const wfCollect=collectFormData;
collectFormData=function(){return {...wfCollect(),workflow:JSON.parse(JSON.stringify(workflow))};};
// Keep the original controls and their listeners for compatibility; mirrors share their data.
document.querySelector('#em-touch').closest('.card').classList.add('wf-original-evaluation');
document.addEventListener('input',e=>{
  const el=e.target,d=el.dataset;
  if(!el.closest('#workflow-card'))return;
  if(d.touch){touchData[d.touch]=el.value;document.getElementById('wf-weight-result').textContent=wfWeightText(workflowPhase==='review'?'final':'inspection');}
  if(d.feedback)evaluation[d.feedback]=el.value;
  if(d.pitch)tuningData[d.pitch]=el.value;
  if(d.tuning)tuningData[d.tuning]=el.value;
  if(d.eval){evaluation[d.eval] ||= {before:3,after:3,memo:''};evaluation[d.eval][d.phase]=+el.value;el.previousElementSibling.textContent=el.value;}
  if(d.finding){const f=wfFinding(d.finding);f[d.field]=el.value;if(d.field==='result'&&d.finding.startsWith('eval.'))evaluation[d.finding.slice(5)].memo=el.value;}
  if(d.measure){const st=checklist.action[d.measure];if(d.zone==='single')st[d.phase]=el.value;else st.mm[d.zone][d.phase]=el.value;}
  if(d.taskMemo)workflow.tasks.find(t=>t.id===d.taskMemo).memo=el.value;
  wfSyncLegacy();wfChanged();
});
document.addEventListener('change',e=>{
  const el=e.target,d=el.dataset;
  if(el.id==='wf-legacy-toggle'){document.body.classList.toggle('wf-show-legacy',el.checked);return;}
  if(!el.closest('#workflow-card'))return;
  if(d.overall)evaluation.overall=el.value;
  if(d.decision)wfFinding(d.decision).state=el.value;
  if(d.taskStatus)workflow.tasks.find(t=>t.id===d.taskStatus).status=el.value;
  if(d.targetMode)workflow.tasks.find(t=>t.id===d.targetMode).target={mode:el.value,keys:[],zones:[]};
  if(d.zoneTask){const target=workflow.tasks.find(t=>t.id===d.zoneTask).target;target.zones=el.checked?[...new Set([...target.zones,el.value])]:target.zones.filter(z=>z!==el.value);}
  if(d.taskLink){const task=workflow.tasks.find(t=>t.id===d.taskLink);task.sources=el.checked?[...new Set([...task.sources,d.source])]:task.sources.filter(id=>id!==d.source);}
  if(d.decision==='pitch'&&el.value==='unnecessary'&&workflow.tasks.some(t=>t.kind==='tuning'&&t.status==='planned'))toast(wfText('予定済みの調律は作業画面で見送りに変更できます','You can defer the planned tuning in Work'));
  wfChanged();if(d.targetMode||d.taskStatus)renderWorkflow();
});
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;const d=el.dataset;
  if(d.wfPhase){workflowPhase=d.wfPhase;renderWorkflow();return;}
  if(!el.closest('#workflow-card'))return;
  if('plan'in d){const source=d.plan;const kind=source?document.querySelector(`[data-kind="${source}"]`).value:document.getElementById('wf-new-kind').value;workflow.tasks.push({id:crypto.randomUUID(),kind,status:'planned',sources:source?[source]:[],target:{mode:'unspecified',keys:[],zones:[]},memo:''});if(source)wfFinding(source).state='needed';}
  else if(d.link){const task=workflow.tasks.find(t=>t.id===document.querySelector(`[data-existing="${d.link}"]`).value);if(task&&!task.sources.includes(d.link))task.sources.push(d.link);wfFinding(d.link).state='needed';}
  else if(d.copyTarget){const i=workflow.tasks.findIndex(t=>t.id===d.copyTarget);if(i>0)workflow.tasks[i].target=JSON.parse(JSON.stringify(workflow.tasks[i-1].target));}
  else if(d.deleteTask){if(!confirm(wfText('この作業を削除しますか？','Delete this task?')))return;workflow.tasks=workflow.tasks.filter(t=>t.id!==d.deleteTask);}
  else if(d.keyTask){const target=workflow.tasks.find(t=>t.id===d.keyTask).target,n=+d.key;if(target.mode==='range'){if(!target.anchor){target.anchor=n;target.keys=[n];}else{const a=Math.min(n,target.anchor),b=Math.max(n,target.anchor);target.keys=Array.from({length:b-a+1},(_,i)=>a+i);delete target.anchor;}}else target.keys=target.keys.includes(n)?target.keys.filter(k=>k!==n):[...target.keys,n];const details=el.closest('details');details.querySelectorAll('[data-key]').forEach(b=>{const selected=target.keys.includes(+b.dataset.key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});details.querySelector('summary').textContent=wfText('キーを指定','Choose keys')+' · '+wfTarget(target);wfChanged();return;}
  else return;
  wfChanged();renderWorkflow();
});
// Refresh mirrors after a legacy control changes, without stealing focus.
document.getElementById('scene-panels').addEventListener('input',()=>renderWorkflow());
const wfSummary=buildSummaryItems;
buildSummaryItems=function(rec){
  const items=wfSummary(rec);if(!rec.workflow)return items;
  const completed=rec.workflow.tasks.filter(t=>t.status==='done');
  const taskKinds=new Set(completed.map(t=>t.kind));
  const keepLegacyTuning=rec.workflow.legacy && !rec.workflow.tasks.some(t=>t.kind==='tuning') && rec.workflow.findings.pitch?.state!=='unnecessary';
  const filtered=items.filter(i=>(!i.id.startsWith('tuning.')||keepLegacyTuning)&&!taskKinds.has(i.id));
  completed.forEach(task=>filtered.push({id:'task.'+task.id,label:wfTaskLabel(task),completed:true,included:true,text:wfTaskText(task)+(task.sources.length?' ['+task.sources.map(wfLabel).join(', ')+']':''),userEdited:false}));
  return filtered;
};
function wfRecordText(rec){
  const w=rec.workflow;if(!w)return '';
  const lines=[];
  const td=rec.tuningData||{};
  if(td.pitchBefore||td.pitchAfter)lines.push(`${wfText('ピッチ','Pitch')}: ${td.pitchBefore||'—'} → ${td.pitchAfter||'—'} Hz`);
  if(td.preCondition)lines.push(wfText('調律前の状態','Initial tuning condition')+': '+td.preCondition);
  if(td.postComment)lines.push(wfText('調律後の状態','Final tuning condition')+': '+td.postComment);
  if(td.stringPinMemo)lines.push(wfText('弦・ピン','Strings / pins')+': '+td.stringPinMemo);
  Object.entries(w.findings).forEach(([id,f])=>{if(f.state!=='uninspected'||f.note||f.result)lines.push(`${wfLabel(id)}: ${f.state==='needed'?wfText('点検済み・作業を検討','Inspected · consider work'):wfStates()[f.state]||f.state}${f.note?' / '+f.note:''}${f.result?' → '+f.result:''}`);});
  w.tasks.forEach(task=>lines.push(`${wfStates()[task.status]}: ${wfTaskText(task)}${task.sources.length?' ['+task.sources.map(wfLabel).join(', ')+']':''}`));
  return lines.join('\n');
}
const wfAutoTags=computeAutoTags;
computeAutoTags=function(rec){const tags=new Set(wfAutoTags(rec));const tasks=rec.workflow?.tasks||[];if(rec.workflow&&!rec.workflow.legacy&&!tasks.some(t=>t.kind==='tuning'&&t.status==='done'))tags.delete('tuning');tasks.filter(t=>t.status==='done').forEach(task=>{if(task.kind==='tuning')tags.add('tuning');else if(task.kind.startsWith('action.'))tags.add('regulation');else if(['needling','filing','hardener'].includes(task.kind))tags.add('voicing');});return [...tags];};
const wfShowDetail=showDetail;
showDetail=function(id){wfShowDetail(id);const rec=records.find(r=>r.id===id);if(!rec?.workflow)return;const card=document.createElement('div');card.className='card';card.innerHTML=`<div class="card-title">${wfText('点検と作業の記録','Inspection and work')}</div><div class="memo-box" style="white-space:pre-wrap">${esc(wfRecordText(rec))}</div>`;document.getElementById('view-detail').appendChild(card);};
if(!editingId){tuningData.pitchBefore='';tuningData.pitchAfter='';restoreTuningUI();}
// Bootstrap is deliberately after the original app's boot so old JSON remains readable.
renderWorkflow();
