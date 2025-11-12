// 8x8 Block Puzzle Game

(function(){
  const SIZE = 8;
  const boardEl = document.getElementById('board');
  const trayEl = document.getElementById('tray');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  const hintBtn = document.getElementById('hintBtn');
  const autoHint = document.getElementById('autoHint');
  const undoBtn = document.getElementById('undoBtn');
  const editBoardChk = document.getElementById('editBoard');
  const pickBlocksBtn = document.getElementById('pickBlocksBtn');
  const newSetBtn = document.getElementById('newSetBtn');
  const pickerDialog = document.getElementById('pickerDialog');
  const pickerEl = document.getElementById('picker');
  const pickerDone = document.getElementById('pickerDone');
  const pickerClear = document.getElementById('pickerClear');
  const editPieceBtn = document.getElementById('editPieceBtn');
  const editorDialog = document.getElementById('editorDialog');
  const editorGrid = document.getElementById('editorGrid');
  const editorDone = document.getElementById('editorDone');
  const editorClear = document.getElementById('editorClear');
  const editorLoad = document.getElementById('editorLoad');

  const appEl = document.querySelector('.app');
  const modeMenu = document.getElementById('modeMenu');
  const menuBtn = document.getElementById('menuBtn');
  const menuPanel = document.getElementById('menuPanel');

  // Default preset shapes (each as list of [r,c])
  const DEFAULT_SHAPES = [
    // singles and lines
    [[0,0]],
    [[0,0],[0,1]],
    [[0,0],[0,1],[0,2]],
    [[0,0],[0,1],[0,2],[0,3]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]],
    // squares
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], // 2x3
    // L shapes
    [[0,0],[1,0],[2,0],[2,1]],
    [[0,1],[1,1],[2,1],[2,0]],
    [[0,0],[0,1],[0,2],[1,0]],
    [[0,0],[0,1],[0,2],[1,2]],
    // T shape
    [[0,0],[0,1],[0,2],[1,1]],
    // S/Z shape
    [[0,1],[0,2],[1,0],[1,1]],
    [[0,0],[0,1],[1,1],[1,2]],
    // plus
    [[0,1],[1,0],[1,1],[1,2],[2,1]],
    // 3x3 missing corner
    [[0,0],[0,1],[0,2],[1,0],[1,1],[2,0]],
  ];

  // Editable presets (persisted)
  function loadPresets(){
    try{
      const s = localStorage.getItem('block_presets');
      if(!s) return DEFAULT_SHAPES.slice();
      const arr = JSON.parse(s);
      if(Array.isArray(arr) && arr.every(x=>Array.isArray(x))) return arr;
      return DEFAULT_SHAPES.slice();
    }catch(_){ return DEFAULT_SHAPES.slice(); }
  }
  function savePresets(list){
    try{ localStorage.setItem('block_presets', JSON.stringify(list)); }catch(_){ /* ignore */ }
  }
  let PRESETS = loadPresets();

  // State
  let board = makeBoard(SIZE);
  let tray = []; // pieces in tray: {cells:[[r,c]], w, h, id}
  let selectedIndex = null; // index in tray
  let score = 0;
  let gameOver = false;
  let mode = 'easy'; // 'easy' | 'hard' | 'practice'
  const undoStack = []; // practice mode only

  // Build static board UI
  function buildBoard(){
    boardEl.style.setProperty('--size', SIZE);
    boardEl.innerHTML = '';
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        boardEl.appendChild(cell);
      }
    }
  }

  function makeBoard(n){
    return Array.from({length:n},()=>Array(n).fill(0));
  }

  function cloneBoard(src){
    return src.map(row=>row.slice());
  }

  function renderBoard(){
    const cells = boardEl.children;
    for(let i=0;i<cells.length;i++){
      const r = Math.floor(i/SIZE), c = i%SIZE;
      cells[i].classList.toggle('filled', board[r][c]===1);
      cells[i].classList.remove('ghost-valid','ghost-invalid','hint');
    }
  }

  function trayPieceSize(cells){
    let maxR=0,maxC=0;
    for(const [r,c] of cells){ maxR=Math.max(maxR,r); maxC=Math.max(maxC,c); }
    return {h:maxR+1,w:maxC+1};
  }

  function makePiece(cells){
    const {h,w} = trayPieceSize(cells);
    const id = Math.random().toString(36).slice(2,9);
    return {cells, h, w, id};
  }

  function randomPiece(){
    const base = PRESETS[Math.floor(Math.random()*PRESETS.length)];
    return makePiece(base);
  }

  function newTray(set){
    tray = set || [randomPiece(), randomPiece(), randomPiece()];
    selectedIndex = null;
    renderTray();
    if(mode!=='practice'){ checkGameOver(); }
    updateHintsIfNeeded();
  }

  function renderTray(){
    trayEl.innerHTML='';
    tray.forEach((p,idx)=>{
      const el = document.createElement('div');
      el.className = 'piece';
      el.style.gridTemplateColumns = `repeat(${p.w}, 18px)`;
      el.dataset.index = String(idx);
      const maxIndex = (p.h*p.w);
      // Fill bounding box grid
      for(let r=0;r<p.h;r++){
        for(let c=0;c<p.w;c++){
          const cell = document.createElement('div');
          cell.className = 'p-cell';
          const filled = p.cells.some(([rr,cc])=>rr===r&&cc===c);
          if(!filled){ cell.style.visibility='hidden'; }
          el.appendChild(cell);
        }
      }
      if(p.used){ el.classList.add('used'); }
      if(selectedIndex===idx){ el.classList.add('selected'); }
      el.addEventListener('click',()=>{
        if(p.used) return;
        selectedIndex = (selectedIndex===idx? null: idx);
        renderTray();
        clearGhost();
        updateHintsIfNeeded();
      });
      trayEl.appendChild(el);
    });
  }

  function getSelectedPiece(){
    if(selectedIndex==null) return null;
    return tray[selectedIndex] && !tray[selectedIndex].used ? tray[selectedIndex] : null;
  }

  function canPlace(b, piece, R, C){
    if(!piece) return false;
    if(R+piece.h>SIZE||C+piece.w>SIZE) return false;
    for(const [r,c] of piece.cells){
      if(b[R+r][C+c]!==0) return false;
    }
    return true;
  }

  function placePiece(b, piece, R, C){
    for(const [r,c] of piece.cells){ b[R+r][C+c]=1; }
    // Clear full rows/cols
    const fullRows=[], fullCols=[];
    for(let r=0;r<SIZE;r++) if(b[r].every(v=>v===1)) fullRows.push(r);
    for(let c=0;c<SIZE;c++){
      let ok=true; for(let r=0;r<SIZE;r++){ if(b[r][c]!==1){ ok=false; break; } }
      if(ok) fullCols.push(c);
    }
    for(const r of fullRows){ for(let c=0;c<SIZE;c++){ b[r][c]=0; } }
    for(const c of fullCols){ for(let r=0;r<SIZE;r++){ b[r][c]=0; } }
    return {rows:fullRows.length, cols:fullCols.length};
  }

  function allPlacements(b, piece){
    const list=[];
    for(let R=0;R<=SIZE-piece.h;R++){
      for(let C=0;C<=SIZE-piece.w;C++){
        if(canPlace(b,piece,R,C)) list.push({R,C});
      }
    }
    return list;
  }

  // Heuristic scoring for hints
  function scorePlacement(b, piece, R, C){
    const tmp = cloneBoard(b);
    const cleared = placePiece(tmp, piece, R, C);
    const cellsPlaced = piece.cells.length;
    const lines = (cleared.rows + cleared.cols);
    // prefer central placements to keep edges free
    const centerR=SIZE/2-0.5, centerC=SIZE/2-0.5;
    let dist=0; for(const [r,c] of piece.cells){ dist += Math.hypot((R+r)-centerR,(C+c)-centerC); }
    const avgDist = dist / cellsPlaced;
    return lines*100 + cellsPlaced*2 - avgDist; // simple heuristic
  }

  function bestHint(b, tray){
    let best=null;
    for(let i=0;i<tray.length;i++){
      const p = tray[i];
      if(p.used) continue;
      const positions = allPlacements(b,p);
      for(const pos of positions){
        const s = scorePlacement(b,p,pos.R,pos.C);
        if(!best || s>best.score) best = {i,p,R:pos.R,C:pos.C,score:s};
      }
    }
    return best; // or null
  }

  function updateHintsIfNeeded(){
    if(mode==='easy' && (autoHint.checked || selectedIndex!=null)){
      showHint();
    }else{
      clearHint();
    }
  }

  function clearHint(){
    const cells = boardEl.children;
    for(let i=0;i<cells.length;i++) cells[i].classList.remove('hint');
  }

  function showHint(){
    clearHint();
    const h = bestHint(board, tray);
    if(!h) return;
    const targetPiece = (selectedIndex!=null ? tray[selectedIndex] : tray[h.i]);
    const R = (selectedIndex!=null && h.i!==selectedIndex) ? null : h.R; // keep best for selected, otherwise overall
    const piece = targetPiece;
    if(R==null) return; // selected piece has no placement
    for(const [r,c] of piece.cells){
      const idx = (R+r)*SIZE + (h.C+c);
      boardEl.children[idx].classList.add('hint');
    }
  }

  function clearGhost(){
    const cells = boardEl.children;
    for(let i=0;i<cells.length;i++) cells[i].classList.remove('ghost-valid','ghost-invalid');
  }

  function previewAt(R, C){
    clearGhost();
    const piece = getSelectedPiece();
    if(!piece) return;
    const ok = canPlace(board, piece, R, C);
    for(const [r,c] of piece.cells){
      const rr=R+r, cc=C+c;
      if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) continue;
      const idx = rr*SIZE+cc;
      boardEl.children[idx].classList.add(ok?'ghost-valid':'ghost-invalid');
    }
  }

  function anyMoveExists(){
    for(const p of tray){
      if(p.used) continue;
      if(allPlacements(board,p).length>0) return true;
    }
    return false;
  }

  function checkGameOver(){
    if(mode==='practice') return;
    if(!anyMoveExists()){
      gameOver = true;
      statusEl.textContent = '詰み：配置できる場所がありません';
      disableInputs(true);
    }else{
      statusEl.textContent = '';
      gameOver = false;
      disableInputs(false);
    }
  }

  function disableInputs(disabled){
    if(mode==='hard'){
      hintBtn.disabled = true; autoHint.disabled = true;
    }else{
      hintBtn.disabled = disabled; autoHint.disabled = disabled;
    }
  }

  // Event listeners for board interactions (mouse + touch via Pointer Events)
  const onHoverCell = (target)=>{
    const cell = target.closest && target.closest('.cell'); if(!cell) return;
    const R = Number(cell.dataset.r), C = Number(cell.dataset.c);
    if(editBoardChk.checked && mode==='practice') return; // editing mode visual is default
    previewAt(R,C);
  };
  boardEl.addEventListener('mousemove', (e)=> onHoverCell(e.target));
  boardEl.addEventListener('pointerdown', (e)=> onHoverCell(e.target));
  boardEl.addEventListener('pointermove', (e)=> onHoverCell(e.target));
  boardEl.addEventListener('mouseleave', ()=>{ clearGhost(); });

  boardEl.addEventListener('click', (e)=>{
    const cell = e.target.closest('.cell'); if(!cell) return;
    const R = Number(cell.dataset.r), C = Number(cell.dataset.c);
    if(mode==='practice' && editBoardChk.checked){
      board[R][C] = board[R][C]?0:1; renderBoard(); updateHintsIfNeeded(); return;
    }
    const piece = getSelectedPiece();
    if(!piece || gameOver) return;
    if(!canPlace(board,piece,R,C)) return;
    if(mode==='practice') pushUndo();
    const cleared = placePiece(board, piece, R, C);
    piece.used = true;
    score += piece.cells.length + (cleared.rows+cleared.cols)*10;
    scoreEl.textContent = String(score);
    renderBoard();
    renderTray();
    clearGhost();
    clearHint();
    // new set when all used
    if(tray.every(p=>p.used)) newTray();
  });

  // Controls
  resetBtn.addEventListener('click', ()=>{ resetGame(); });
  hintBtn.addEventListener('click', ()=>{ if(mode==='easy') showHint(); });
  autoHint.addEventListener('change', ()=>{ updateHintsIfNeeded(); });
  undoBtn.addEventListener('click', ()=>{ if(mode==='practice') undo(); });
  pickBlocksBtn.addEventListener('click', openPicker);
  newSetBtn.addEventListener('click', ()=>{ if(mode==='practice') newTray(); });
  editPieceBtn.addEventListener('click', openEditor);

  document.querySelectorAll('input[name="mode"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      mode = document.querySelector('input[name="mode"]:checked').value;
      applyMode();
      resetGame();
      // close menu after selection
      closeMenu();
    });
  });

  // Hamburger menu behavior
  function closeMenu(){
    if(!modeMenu) return;
    modeMenu.classList.remove('open');
    menuBtn && menuBtn.setAttribute('aria-expanded','false');
  }
  function toggleMenu(){
    const open = modeMenu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if(menuBtn){
    menuBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleMenu(); });
  }
  document.addEventListener('click', (e)=>{
    if(!modeMenu.classList.contains('open')) return;
    if(modeMenu.contains(e.target)) return; // inside
    closeMenu();
  });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });

  function applyMode(){
    appEl.classList.toggle('mode-easy', mode==='easy');
    appEl.classList.toggle('mode-practice', mode==='practice');
  }

  function resetGame(){
    board = makeBoard(SIZE);
    score = 0; scoreEl.textContent = '0';
    statusEl.textContent = '';
    gameOver = false; selectedIndex = null; undoStack.length=0;
    renderBoard(); newTray(); renderTray(); disableInputs(false);
  }

  // Practice: Undo support
  function snapshot(){
    return {board: cloneBoard(board), tray: JSON.parse(JSON.stringify(tray)), score};
  }
  function pushUndo(){ undoStack.push(snapshot()); if(undoStack.length>200) undoStack.shift(); }
  function undo(){ const s = undoStack.pop(); if(!s) return; board=s.board; tray=s.tray; score=s.score; renderBoard(); renderTray(); scoreEl.textContent=String(score); }

  // Picker dialog for practice mode
  function openPicker(){
    if(mode!=='practice') return;
    pickerEl.innerHTML='';
    const items = PRESETS.map(sh=> makePiece(sh));
    items.forEach((p,i)=>{
      const el = renderPieceMini(p);
      el.addEventListener('click',()=>{
        // fill first available slot or replace selected
        const slot = tray.findIndex(t=>t.used||!t);
        if(slot>=0){ tray[slot] = makePiece(p.cells); tray[slot].used=false; }
        else{
          // replace selected or first
          const idx = selectedIndex ?? 0; tray[idx] = makePiece(p.cells); tray[idx].used=false;
        }
        renderTray();
      });
      pickerEl.appendChild(el);
    });
    pickerClear.onclick = ()=>{ tray = [null,null,null].map(()=>randomPiece()); renderTray(); };
    pickerDialog.showModal();
    pickerDone.onclick = ()=>{ pickerDialog.close(); };
  }

  function renderPieceMini(p){
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.gridTemplateColumns = `repeat(${Math.max(p.w,5)}, 18px)`;
    // Render into a 5x5 area centered
    const offsetR = Math.floor((5 - p.h)/2);
    const offsetC = Math.floor((5 - p.w)/2);
    const filledSet = new Set(p.cells.map(([r,c])=>`${r+offsetR},${c+offsetC}`));
    for(let r=0;r<5;r++){
      for(let c=0;c<5;c++){
        const cell = document.createElement('div');
        cell.className='p-cell';
        if(!filledSet.has(`${r},${c}`)) cell.style.visibility='hidden';
        el.appendChild(cell);
      }
    }
    return el;
  }

  // ---------- Block Editor (Practice) ----------
  // generic 5x5 grid helpers
  function build5Grid(grid){
    grid.innerHTML='';
    for(let r=0;r<5;r++){
      for(let c=0;c<5;c++){
        const cell=document.createElement('div');
        cell.className='editor-cell';
        cell.dataset.r=String(r); cell.dataset.c=String(c);
        cell.addEventListener('click',()=> cell.classList.toggle('on'));
        grid.appendChild(cell);
      }
    }
  }
  function gridGetShape(grid){
    const cells=[];
    for(const el of grid.children){ if(el.classList.contains('on')) cells.push([+el.dataset.r, +el.dataset.c]); }
    if(cells.length===0) return [];
    const minR=Math.min(...cells.map(v=>v[0]));
    const minC=Math.min(...cells.map(v=>v[1]));
    return cells.map(([r,c])=>[r-minR,c-minC]);
  }
  function gridSetFromPiece(grid,p){
    for(const el of grid.children) el.classList.remove('on');
    if(!p) return;
    const offR=Math.floor((5-p.h)/2), offC=Math.floor((5-p.w)/2);
    for(const [r,c] of p.cells){ const rr=r+offR, cc=c+offC; if(rr>=0&&cc>=0&&rr<5&&cc<5){ grid.children[rr*5+cc].classList.add('on'); } }
  }
  // wrappers for existing editor
  function buildEditorGrid(){ build5Grid(editorGrid); }
  function editorGetShape(){ return gridGetShape(editorGrid); }
  function editorSetFromPiece(p){ gridSetFromPiece(editorGrid,p); }

  function openEditor(){
    if(mode!=='practice') return;
    buildEditorGrid();
    // set slot radios
    const radios = editorDialog.querySelectorAll('input[name="slot"]');
    const def = (selectedIndex==null?0:selectedIndex);
    radios.forEach((r,i)=>{ r.checked = (i===def); });
    // preload from selected piece if exists
    editorSetFromPiece(getSelectedPiece());
    editorClear.onclick = ()=>{ for(const el of editorGrid.children) el.classList.remove('on'); };
    editorLoad.onclick = ()=>{ editorSetFromPiece(getSelectedPiece()); };
    editorDone.onclick = ()=>{
      const shape = editorGetShape();
      if(shape.length===0){ alert('1マス以上を選択してください'); return; }
      const p = makePiece(shape);
      const slot = Number(editorDialog.querySelector('input[name="slot"]:checked').value);
      tray[slot] = p; tray[slot].used=false; selectedIndex = slot;
      renderTray(); updateHintsIfNeeded(); editorDialog.close();
    };
    editorDialog.showModal();
  }

  // ---------- Preset Manager ----------
  const presetBtn = document.getElementById('presetBtn');
  const presetDialog = document.getElementById('presetDialog');
  const presetListEl = document.getElementById('presetList');
  const presetEditor = document.getElementById('presetEditor');
  const presetAdd = document.getElementById('presetAdd');
  const presetRemove = document.getElementById('presetRemove');
  const presetClose = document.getElementById('presetClose');
  const presetJson = document.getElementById('presetJson');
  const presetExport = document.getElementById('presetExport');
  const presetCopy = document.getElementById('presetCopy');
  const presetImport = document.getElementById('presetImport');
  let selectedPreset = null;

  presetBtn.addEventListener('click', openPresetManager);

  function renderPresetList(){
    presetListEl.innerHTML='';
    PRESETS.forEach((shape,idx)=>{
      const p = makePiece(shape);
      const el = renderPieceMini(p);
      el.dataset.idx=String(idx);
      if(selectedPreset===idx) el.classList.add('selected');
      el.addEventListener('click',()=>{
        selectedPreset = (selectedPreset===idx? null: idx);
        renderPresetList();
      });
      presetListEl.appendChild(el);
    });
  }

  function openPresetManager(){
    if(mode!=='practice') return;
    build5Grid(presetEditor);
    gridSetFromPiece(presetEditor, getSelectedPiece());
    selectedPreset = null;
    renderPresetList();
    presetJson.value = '';
    presetAdd.onclick = ()=>{
      const sh = gridGetShape(presetEditor);
      if(sh.length===0){ alert('1マス以上選択してください'); return; }
      PRESETS.push(sh); savePresets(PRESETS); renderPresetList();
    };
    presetRemove.onclick = ()=>{
      if(selectedPreset==null){ alert('削除するプリセットを選択してください'); return; }
      if(PRESETS.length<=1){ alert('最後のプリセットは削除できません'); return; }
      PRESETS.splice(selectedPreset,1); savePresets(PRESETS); selectedPreset=null; renderPresetList();
    };
    presetExport.onclick = ()=>{ presetJson.value = JSON.stringify(PRESETS); };
    presetCopy.onclick = async ()=>{
      if(!presetJson.value) presetJson.value = JSON.stringify(PRESETS);
      try{ await navigator.clipboard.writeText(presetJson.value); alert('コピーしました'); }catch(_){ /* ignore */ }
    };
    presetImport.onclick = ()=>{
      if(!presetJson.value){ alert('JSONを貼り付けてください'); return; }
      try{
        const arr = JSON.parse(presetJson.value);
        if(!Array.isArray(arr)) throw new Error('invalid');
        PRESETS = arr; savePresets(PRESETS); renderPresetList(); alert('インポートしました');
      }catch(e){ alert('JSONの形式が正しくありません'); }
    };
    presetClose.onclick = ()=>{ presetDialog.close(); };
    presetDialog.showModal();
  }

  // Initialization
  buildBoard();
  renderBoard();
  applyMode();
  resetGame();
})();
