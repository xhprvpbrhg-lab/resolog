/* Inspection → work → review. Existing measurements remain the single source of truth. */
let workflow = emptyWorkflow();
let workflowPhase = 'inspection';
let wfWorkScene = 'action';
const wfOriginalSwitchScene = switchScene;
switchScene = function(id) { wfWorkScene=id; wfOriginalSwitchScene(id); };
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
// Suggestions are shortcuts, not automatic diagnoses; every catalog item remains available.
function wfRelevantKinds(id) {
  if(id.startsWith('action.')) return [id];
  const map = {
    pitch:['tuning'],
    'eval.touch':['action.keyBushing','action.repSpring','action.bedding','needling'],
    'eval.repetition':['action.repSpring','action.jack','action.letOff','action.keyBushing'],
    'eval.volume':['hardener','needling','filing'],
    'eval.tone_color':['needling','hardener','filing'],
    'eval.intonation':['action.hammerAlign','filing','needling','hardener'],
    'eval.dynamics_curve':['needling','hardener','filing'],
    'eval.evenness':['needling','hardener','action.hammerAlign'],
    unaCorda:['needling','filing','action.hammerAlign','action.actionPos'],
    pedal:['action.damperPlay','action.damperMute','action.damperStop','action.sostenuto']
  };
  return (map[id]||[]).filter(kind=>wfCatalog().some(c=>c.id===kind));
}
function wfAddTask(kind,source='') {
  // Reuse a planned treatment across findings; separate treatments can be added from Work.
  let task=source && workflow.tasks.find(t=>t.kind===kind&&t.status==='planned');
  if(!task){task={id:crypto.randomUUID(),kind,status:'planned',sources:[],target:{mode:'unspecified',keys:[],zones:[]},memo:kind.startsWith('action.')?(checklist.action?.[kind.slice(7)]?.memo||''):''};workflow.tasks.push(task);}
  if(source&&!task.sources.includes(source))task.sources.push(source);
  if(source)wfFinding(source).state='needed';
  return task;
}
function wfPlanControls(id) {
  const relevant=wfRelevantKinds(id),catalog=wfCatalog();
  const tags=relevant.map(kind=>{
    const selected=workflow.tasks.some(t=>t.kind===kind&&t.sources.includes(id));
    return `<button type="button" class="wf-tag" data-quick-kind="${kind}" data-quick-source="${id}" aria-pressed="${selected}">${esc(catalog.find(c=>c.id===kind).label)}</button>`;
  }).join('');
  const other=catalog.filter(c=>!relevant.includes(c.id));
  const linked=workflow.tasks.filter(t=>t.sources.includes(id));
  return `<div class="wf-quick-tags">${tags}</div>${wfSelect(Object.fromEntries([['',wfText('その他の作業…','Other work…')],...other.map(c=>[c.id,c.label])]),'',`data-other-source="${id}" aria-label="${esc(wfLabel(id))} ${wfText('その他の作業','Other work')}"`)}
    ${linked.length?`<div class="wf-muted">${linked.map(task=>esc(wfTaskLabel(task))+' · '+wfStates()[task.status]).join(' / ')}</div>`:''}
    ${workflow.tasks.some(t=>!t.sources.includes(id))?`<details class="wf-existing"><summary>${wfText('記録済みの作業に関連づけ','Link a recorded task')}</summary>${workflow.tasks.filter(t=>!t.sources.includes(id)).map(task=>`<button type="button" data-direct-link="${task.id}" data-source="${id}">${esc(wfTaskText(task))}</button>`).join('')}</details>`:''}`;
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
  // The existing checklist DOM is mounted here by renderWorkflow, preserving its handlers.
  return `<div id="wf-checklist-mount"></div><div class="wf-plan"><select id="wf-new-kind" aria-label="${wfText('作業の種類','Work type')}">${wfCatalog().map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select><button type="button" data-plan="">${wfText('別の処置を追加','Add another treatment')}</button></div>`;
}
function wfTaskEditor(task,index) {
  const hasChecklistMemo=task.kind.startsWith('action.')&&document.querySelector('#iw-action-'+task.kind.slice(7)+' .item-memo');
  return `<details class="wf-task-details"><summary>${wfText('対象・処置の詳細・関連評価','Target, treatment and related evaluations')}${wfTarget(task.target)?' · '+esc(wfTarget(task.target)):''}</summary>
    ${task.sources.includes('pitch')?`<p>${wfText('調律前','Before')}: ${esc(tuningData.pitchBefore||'—')} Hz / ${esc(tuningData.preCondition||'')}</p>`:''}
    ${wfTargetEditor(task)}${index?`<button type="button" data-copy-target="${task.id}">${wfText('直前の作業と同じ対象','Use previous target')}</button>`:''}
    ${hasChecklistMemo?'':wfField(wfText('処置内容（部位・深さ・量・薬剤・濃度など）','Treatment (location, depth, amount, agent, concentration)'),`<textarea data-task-memo="${task.id}">${esc(task.memo)}</textarea>`)}
    <fieldset class="wf-links"><legend>${wfText('関連する点検・評価','Related inspections / evaluations')}</legend>${wfSources().map(source=>`<label class="wf-link-row"><input type="checkbox" data-task-link="${task.id}" data-source="${source.id}" ${task.sources.includes(source.id)?'checked':''}> ${esc(source.label)}</label>`).join('')}</fieldset>
    ${wfSelect(Object.fromEntries(['planned','done','deferred'].map(state=>[state,wfStates()[state]])),task.status,`data-task-status="${task.id}" aria-label="${wfText('作業状態','Task status')}"`)}
    <button type="button" data-delete-task="${task.id}">${wfText('作業を削除','Delete task')}</button></details>`;
}
function wfTaskRow(task,index) {
  return `<div class="item-wrapper wf-treatment" data-task="${task.id}"><label class="checklist-item ${task.status==='done'?'checked':''}"><input type="checkbox" data-task-complete="${task.id}" ${task.status==='done'?'checked':''}><span class="item-label">${esc(wfTaskLabel(task))}</span><small class="wf-task-state">${wfStates()[task.status]}</small></label>${wfTaskEditor(task,index)}</div>`;
}
function wfMountChecklist() {
  const card=document.querySelector('#view-new .scenes-card');
  const mount=document.getElementById('wf-checklist-mount');
  if(!mount||!card)return;
  mount.appendChild(card);
  card.querySelectorAll('.wf-injected').forEach(el=>el.remove());
  card.querySelectorAll('.wf-planned-item').forEach(el=>el.classList.remove('wf-planned-item'));
  // Replace purpose-based voicing inputs with operation-based checklist rows.
  const voicing=document.getElementById('panel-voicing');
  let legacy=voicing.querySelector('.wf-legacy-voicing');
  if(!legacy){legacy=document.createElement('details');legacy.className='wf-legacy-voicing';legacy.innerHTML=`<summary>${wfText('以前の目的別整音記録','Legacy purpose-based voicing records')}</summary>`;while(voicing.firstChild)legacy.appendChild(voicing.firstChild);voicing.appendChild(legacy);}
  legacy.hidden=!Object.values(checklist.voicing||{}).some(st=>st.checked||st.memo);
  const operations=document.createElement('div');operations.className='wf-injected';
  const standalone=workflow.tasks.filter(task=>!task.kind.startsWith('action.')&&task.kind!=='tuning');
  const kinds=['needling','hardener','filing'];
  operations.innerHTML=kinds.map(kind=>{
    const tasks=standalone.filter(task=>task.kind===kind);
    return tasks.length?tasks.map(task=>wfTaskRow(task,workflow.tasks.indexOf(task))).join(''):`<div class="item-wrapper"><label class="checklist-item"><input type="checkbox" data-start-kind="${kind}"><span class="item-label">${esc(wfCatalog().find(c=>c.id===kind).label)}</span></label></div>`;
  }).join('')+standalone.filter(task=>!kinds.includes(task.kind)).map(task=>wfTaskRow(task,workflow.tasks.indexOf(task))).join('');
  voicing.prepend(operations);
  const tuning=document.getElementById('panel-tuning');
  const tuningRows=document.createElement('div');tuningRows.className='wf-injected';
  const tuningTasks=workflow.tasks.filter(task=>task.kind==='tuning');
  tuningRows.innerHTML=tuningTasks.length?tuningTasks.map(task=>wfTaskRow(task,workflow.tasks.indexOf(task))).join(''):`<label class="checklist-item"><input type="checkbox" data-start-kind="tuning"><span class="item-label">${wfText('調律を実施','Tuning performed')}</span></label>`;
  tuning.prepend(tuningRows);
  workflow.tasks.filter(task=>task.kind.startsWith('action.')).forEach(task=>{
    const wrapper=document.getElementById('iw-action-'+task.kind.slice(7));if(!wrapper)return;
    wrapper.classList.add('wf-planned-item');
    const cb=wrapper.querySelector('.checklist-item input[type=checkbox]');
    const done=workflow.tasks.some(t=>t.kind===task.kind&&t.status==='done');
    if(done){checklist.action[task.kind.slice(7)].checked=true;cb.checked=true;cb.closest('.checklist-item').classList.add('checked');}
    const memo=wrapper.querySelector('.item-memo');
    if(memo&&task.memo&&!memo.value){memo.value=task.memo;checklist.action[task.kind.slice(7)].memo=task.memo;}
    const extra=document.createElement('div');extra.className='wf-injected';extra.dataset.task=task.id;extra.innerHTML=`<small class="wf-task-state">${wfStates()[task.status]}</small>${wfTaskEditor(task,workflow.tasks.indexOf(task))}`;wrapper.appendChild(extra);
  });
  let dkTab=card.querySelector('[data-wf-dk]');
  if(!dkTab){dkTab=document.createElement('button');dkTab.type='button';dkTab.dataset.wfDk='true';dkTab.textContent='Disklavier';card.querySelector('.scene-tab-bar').appendChild(dkTab);}
  dkTab.hidden=!isDK;
  switchScene(wfWorkScene);
  updateDkVisibility();
}
function wfMeasureText(st,item) {
  if(!st)return '';
  return item.hasMm?['bass','mid','treble'].map(z=>`${({bass:t('zoneBass'),mid:t('zoneMid'),treble:t('zoneTreble')})[z]} ${st.mm?.[z]?.before||'—'} → ${st.mm?.[z]?.after||'—'} mm`).join(' / '):`${st.before||'—'} → ${st.after||'—'} mm`;
}
function renderWorkflow() {
  let root=document.getElementById('workflow-card');
  if(!root){root=document.createElement('div');root.id='workflow-card';root.className='card';document.querySelector('#view-new .scenes-card').before(root);}
  const opened=[...root.querySelectorAll('[data-task] details[open]')].map(el=>el.closest('[data-task]').dataset.task);
  const dkSection=document.querySelector('#wf-dk-mount .dk-section');
  if(dkSection)document.getElementById('panel-final')?.appendChild(dkSection);
  const checklistCard=document.querySelector('#view-new .scenes-card');
  if(root.contains(checklistCard))root.after(checklistCard);
  root.innerHTML=`<div class="card-title">${wfText('点検・作業・最終確認','Inspection · work · review')}</div><nav class="wf-tabs">${[['inspection',wfText('1 点検','1 Inspect')],['work',wfText('2 作業','2 Work')],['review',wfText('3 最終確認','3 Review')]].map(([id,label])=>`<button type="button" data-wf-phase="${id}" aria-pressed="${id===workflowPhase}">${label}</button>`).join('')}</nav><div id="wf-body">${workflowPhase==='work'?wfRenderTasks():wfRenderInspectionOrReview(workflowPhase==='review')}</div><label class="wf-link-row"><input type="checkbox" id="wf-legacy-toggle" ${document.body.classList.contains('wf-show-legacy')?'checked':''}>${wfText('詳細チェックリスト・既存記録を表示','Show detailed checklist / legacy records')}</label>`;
  document.getElementById('wf-legacy-toggle').closest('label').hidden=workflowPhase==='work';
  if(workflowPhase==='work')wfMountChecklist();
  opened.forEach(id=>root.querySelector(`[data-task="${id}"] details`)?.setAttribute('open',''));
  const dk=document.querySelector('#panel-final .dk-section')||document.querySelector('#wf-dk-mount .dk-section');
  if(dk&&workflowPhase==='review'&&isDK){const mount=document.createElement('section');mount.id='wf-dk-mount';mount.className='wf-section';root.querySelector('#wf-body').appendChild(mount);mount.appendChild(dk);updateDkVisibility();}
}
const wfRootInit=initChecklist;
initChecklist=function(){wfRootInit();tuningData.pitchBefore='';tuningData.pitchAfter='';workflow=emptyWorkflow();workflowPhase='inspection';wfWorkScene='action';};
const wfBuildScenes=buildScenes;
buildScenes=function(){const dk=document.querySelector('#wf-dk-mount .dk-section');if(dk)document.getElementById('panel-final')?.appendChild(dk);wfBuildScenes();renderWorkflow();};
const wfPopulate=populateFormForEdit;
populateFormForEdit=function(rec){workflow=JSON.parse(JSON.stringify(rec.workflow||{...emptyWorkflow(),legacy:true}));workflowPhase='inspection';wfPopulate(rec);renderWorkflow();};
const wfCollect=collectFormData;
collectFormData=function(){return {...wfCollect(),workflow:JSON.parse(JSON.stringify(workflow))};};
// Keep the original controls and their listeners for compatibility; mirrors share their data.
document.querySelector('#em-touch').closest('.card').classList.add('wf-original-evaluation');
document.addEventListener('input',e=>{
  const el=e.target,d=el.dataset;
  if(!el.closest('#workflow-card')||(!d.touch&&!d.feedback&&!d.pitch&&!d.tuning&&!d.eval&&!d.finding&&!d.measure&&!d.taskMemo))return;
  if(d.touch){touchData[d.touch]=el.value;document.getElementById('wf-weight-result').textContent=wfWeightText(workflowPhase==='review'?'final':'inspection');}
  if(d.feedback)evaluation[d.feedback]=el.value;
  if(d.pitch)tuningData[d.pitch]=el.value;
  if(d.tuning)tuningData[d.tuning]=el.value;
  if(d.eval){evaluation[d.eval] ||= {before:3,after:3,memo:''};evaluation[d.eval][d.phase]=+el.value;el.previousElementSibling.textContent=el.value;}
  if(d.finding){const f=wfFinding(d.finding);f[d.field]=el.value;if(d.field==='result'&&d.finding.startsWith('eval.'))evaluation[d.finding.slice(5)].memo=el.value;}
  if(d.measure){const st=checklist.action[d.measure];if(d.zone==='single')st[d.phase]=el.value;else st.mm[d.zone][d.phase]=el.value;}
  if(d.taskMemo){const task=workflow.tasks.find(t=>t.id===d.taskMemo);task.memo=el.value;if(task.kind.startsWith('action.'))checklist.action[task.kind.slice(7)].memo=el.value;}
  wfSyncLegacy();wfChanged();
});
document.addEventListener('change',e=>{
  const el=e.target,d=el.dataset;
  if(el.id==='wf-legacy-toggle'){document.body.classList.toggle('wf-show-legacy',el.checked);return;}
  if(!el.closest('#workflow-card'))return;
  if(d.otherSource!==undefined&&el.value){wfAddTask(el.value,d.otherSource);wfChanged();renderWorkflow();return;}
  if(d.taskComplete){const task=workflow.tasks.find(t=>t.id===d.taskComplete);task.status=el.checked?'done':'planned';if(task.kind.startsWith('action.'))checklist.action[task.kind.slice(7)].checked=el.checked;}
  if(d.startKind){wfAddTask(d.startKind).status='done';wfChanged();renderWorkflow();return;}
  if(d.overall)evaluation.overall=el.value;
  if(d.decision)wfFinding(d.decision).state=el.value;
  if(d.taskStatus){const task=workflow.tasks.find(t=>t.id===d.taskStatus);task.status=el.value;if(task.kind.startsWith('action.')){const st=checklist.action?.[task.kind.slice(7)];if(st)st.checked=el.value==='done';restoreChecklistUI();const cb=document.querySelector('#iw-action-'+task.kind.slice(7)+' input[type=checkbox]');if(cb){cb.checked=st?.checked||false;cb.closest('.checklist-item').classList.toggle('checked',cb.checked);}}}
  if(d.targetMode)workflow.tasks.find(t=>t.id===d.targetMode).target={mode:el.value,keys:[],zones:[]};
  if(d.zoneTask){const target=workflow.tasks.find(t=>t.id===d.zoneTask).target;target.zones=el.checked?[...new Set([...target.zones,el.value])]:target.zones.filter(z=>z!==el.value);}
  if(d.taskLink){const task=workflow.tasks.find(t=>t.id===d.taskLink);task.sources=el.checked?[...new Set([...task.sources,d.source])]:task.sources.filter(id=>id!==d.source);}
  if(d.decision==='pitch'&&el.value==='unnecessary'&&workflow.tasks.some(t=>t.kind==='tuning'&&t.status==='planned'))toast(wfText('予定済みの調律は作業画面で見送りに変更できます','You can defer the planned tuning in Work'));
  wfChanged();if(d.targetMode||d.taskStatus||d.taskComplete)renderWorkflow();
});
document.addEventListener('click',e=>{
  const el=e.target.closest('button');if(!el)return;const d=el.dataset;
  if(d.wfDk){switchScene('final');document.querySelector('#panel-final .dk-section')?.scrollIntoView?.({block:'nearest'});return;}
  if(d.wfPhase){workflowPhase=d.wfPhase;renderWorkflow();return;}
  if(!el.closest('#workflow-card'))return;
  if(d.quickKind){const linked=workflow.tasks.find(task=>task.kind===d.quickKind&&task.sources.includes(d.quickSource));if(linked){linked.sources=linked.sources.filter(id=>id!==d.quickSource);if(!linked.sources.length&&linked.status==='planned'&&!linked.memo&&linked.target.mode==='unspecified')workflow.tasks=workflow.tasks.filter(task=>task!==linked);}else wfAddTask(d.quickKind,d.quickSource);}
  else if(d.directLink){const task=workflow.tasks.find(task=>task.id===d.directLink);if(task&&!task.sources.includes(d.source))task.sources.push(d.source);wfFinding(d.source).state='needed';}
  else if('plan'in d){const source=d.plan;const kind=source?document.querySelector(`[data-kind="${source}"]`).value:document.getElementById('wf-new-kind').value;workflow.tasks.push({id:crypto.randomUUID(),kind,status:'planned',sources:source?[source]:[],target:{mode:'unspecified',keys:[],zones:[]},memo:''});if(source)wfFinding(source).state='needed';}
  else if(d.link){const task=workflow.tasks.find(t=>t.id===document.querySelector(`[data-existing="${d.link}"]`).value);if(task&&!task.sources.includes(d.link))task.sources.push(d.link);wfFinding(d.link).state='needed';}
  else if(d.copyTarget){const i=workflow.tasks.findIndex(t=>t.id===d.copyTarget);if(i>0)workflow.tasks[i].target=JSON.parse(JSON.stringify(workflow.tasks[i-1].target));}
  else if(d.deleteTask){if(!confirm(wfText('この作業を削除しますか？','Delete this task?')))return;workflow.tasks=workflow.tasks.filter(t=>t.id!==d.deleteTask);}
  else if(d.keyTask){const target=workflow.tasks.find(t=>t.id===d.keyTask).target,n=+d.key;if(target.mode==='range'){if(!target.anchor){target.anchor=n;target.keys=[n];}else{const a=Math.min(n,target.anchor),b=Math.max(n,target.anchor);target.keys=Array.from({length:b-a+1},(_,i)=>a+i);delete target.anchor;}}else target.keys=target.keys.includes(n)?target.keys.filter(k=>k!==n):[...target.keys,n];const details=el.closest('details');details.querySelectorAll('[data-key]').forEach(b=>{const selected=target.keys.includes(+b.dataset.key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});details.querySelector('summary').textContent=wfText('キーを指定','Choose keys')+' · '+wfTarget(target);wfChanged();return;}
  else return;
  wfChanged();renderWorkflow();
});
// Legacy controls keep their own listeners. Only synchronize linked task metadata here.
document.getElementById('scene-panels').addEventListener('input',event=>{
  const wrapper=event.target.closest('.item-wrapper');
  if(wrapper?.id.startsWith('iw-action-')&&event.target.matches('.item-memo')){
    workflow.tasks.filter(task=>task.kind==='action.'+wrapper.id.slice(10)).forEach(task=>task.memo=event.target.value);
  }
  if(workflowPhase!=='work')renderWorkflow();
});
document.getElementById('scene-panels').addEventListener('change',event=>{
  const wrapper=event.target.closest('.item-wrapper');
  if(!wrapper?.id.startsWith('iw-action-')||!event.target.matches('.checklist-item input[type=checkbox]'))return;
  const kind='action.'+wrapper.id.slice(10);
  workflow.tasks.filter(task=>task.kind===kind).forEach(task=>task.status=event.target.checked?'done':'planned');
  wrapper.querySelectorAll('.wf-task-state').forEach(el=>el.textContent=event.target.checked?wfStates().done:wfStates().planned);
  wrapper.querySelectorAll('[data-task-status]').forEach(el=>el.value=event.target.checked?'done':'planned');
  markDirty();
});
document.getElementById('f-disklavier').addEventListener('change',()=>{renderWorkflow();});

const wfSummary=buildSummaryItems;
buildSummaryItems=function(rec){
  const items=wfSummary(rec);if(!rec.workflow)return items;
  const completed=rec.workflow.tasks.filter(t=>t.status==='done');
  const taskKinds=new Set(completed.map(t=>t.kind));
  const keepLegacyTuning=rec.workflow.legacy && !rec.workflow.tasks.some(t=>t.kind==='tuning') && rec.workflow.findings.pitch?.state!=='unnecessary';
  const filtered=items.filter(i=>(!i.id.startsWith('tuning.')||keepLegacyTuning)&&!taskKinds.has(i.id));
  completed.forEach(task=>{
    const checklistItem=task.kind.startsWith('action.')?items.find(item=>item.id===task.kind):null;
    const text=checklistItem?[checklistItem.text,wfTarget(task.target)].filter(Boolean).join(' / '):wfTaskText(task);
    filtered.push({id:'task.'+task.id,label:wfTaskLabel(task),completed:true,included:true,text:text+(task.sources.length?' ['+task.sources.map(wfLabel).join(', ')+']':''),userEdited:false});
  });
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
