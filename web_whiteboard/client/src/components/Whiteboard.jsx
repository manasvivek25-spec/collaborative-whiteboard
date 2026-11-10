import React, { useRef, useEffect, useState, useCallback } from 'react';
import Toolbar from './Toolbar';
import ParticipantsDrawer from './ParticipantsDrawer';
import ChatDrawer from './ChatDrawer';
import InstancesModal from './InstancesModal';
import AddMemberModal from './AddMemberModal';
import TableModal from './TableModal';
import { recognizeInkStrokes } from '../utils/inkToFont';
import {
  Users,
  MessageSquare,
  History,
  UserPlus,
  ArrowLeft,
  Shield,
  Lock,
  Sparkles,
  Check,
  Download,
  Hand,
  RotateCcw
} from 'lucide-react';

export default function Whiteboard({
  room,
  user,
  onBackToHub,
  ws,
  isOffline = false
}) {
  const bgCanvasRef = useRef(null);
  const canvasRef = useRef(null);

  // Active Tool & Canvas State
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeShape, setActiveShape] = useState('rect');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [gridMode, setGridMode] = useState('square'); // 'none' | 'square' | 'dot' | 'ruled'

  // Canvas Action Records
  const [actions, setActions] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);
  const [streamingStrokes, setStreamingStrokes] = useState(new Map());

  // Infinite Pan Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, origX: 0, origY: 0 });

  // Table Tool State
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [tableDrag, setTableDrag] = useState(null);
  const [tableResize, setTableResize] = useState(null);

  // Room & Peer State
  const [roomData, setRoomData] = useState(room);
  const [members, setMembers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [chatMessages, setChatMessages] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [myPermissions, setMyPermissions] = useState({ can_draw: true, role: 'member' });

  // Drawers & Modals
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMilestonesOpen, setIsMilestonesOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusText, setStatusText] = useState('Connected to session');
  const [roomNotification, setRoomNotification] = useState(null);

  const isHost = roomData?.host_user_code === user?.user_code || isOffline;
  const isCohost = myPermissions.role === 'cohost';

  // Helper notification toast
  const showNotification = (text) => {
    setRoomNotification(text);
    setTimeout(() => {
      setRoomNotification(prev => (prev === text ? null : prev));
    }, 4500);
  };

  // ── WEBSOCKET REAL-TIME SYNC ──────────────────────────────────────────
  useEffect(() => {
    if (isOffline || !ws) return;

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'join_room',
        room_code: room.code,
        user_code: user?.user_code,
        user_name: user?.name,
        avatar_color: user?.avatar_color
      }));
    }

    const onMessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('[!] Failed to parse message:', err);
      }
    };

    ws.addEventListener('message', onMessage);
    return () => {
      ws.removeEventListener('message', onMessage);
    };
  }, [room.code, ws, isOffline, user]);

  const handleServerMessage = (msg) => {
    switch (msg.type) {
      case 'join_ack':
        setRoomData(msg.room);
        setMyPermissions(msg.my_permissions || { can_draw: true, role: 'member' });
        setMembers(msg.members || []);
        setActions(msg.actions || []);
        setChatMessages(msg.chat || []);
        setMilestones(msg.milestones || []);
        setStatusText(`Connected to ${msg.room.title}`);
        break;

      case 'user_joined':
        setMembers(msg.members || []);
        setStatusText(`${msg.user_name} joined the room`);
        showNotification(`👋 ${msg.user_name} joined the room`);
        break;

      case 'user_left':
        setMembers(msg.members || []);
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.delete(msg.user_code);
          return next;
        });
        setStatusText(`${msg.user_name || 'A user'} left the room`);
        showNotification(`🚪 ${msg.user_name || 'A user'} left the room`);
        break;

      case 'members_updated':
      case 'room_settings_updated':
        if (msg.members) {
          setMembers(msg.members);
          const me = msg.members.find(m => m.user_code === user?.user_code);
          if (me) {
            const canDrawBool = Boolean(me.can_draw);
            setMyPermissions(prev => ({
              ...prev,
              can_draw: canDrawBool,
              role: me.role,
              can_save_instance: Boolean(me.can_save_instance)
            }));
            if (!canDrawBool) {
              showNotification('🔒 The Host has updated your drawing permissions to View-Only.');
            }
          }
        }
        if (msg.room) setRoomData(msg.room);
        break;

      case 'stroke_pts':
        setStreamingStrokes(prev => {
          const next = new Map(prev);
          const existing = next.get(msg.id) || {
            points: [],
            color: msg.color,
            width: msg.width,
            brush: msg.brush,
            opacity: msg.opacity
          };
          existing.points.push(...msg.points);
          next.set(msg.id, existing);
          return next;
        });
        break;

      case 'action':
        setActions(prev => {
          const filtered = prev.filter(a => a.id !== msg.action.id);
          return [...filtered, msg.action];
        });
        setStreamingStrokes(prev => {
          const next = new Map(prev);
          next.delete(msg.action.id);
          return next;
        });
        break;

      case 'undo':
        setActions(prev => prev.map(a => a.id === msg.target ? { ...a, undone: true } : a));
        break;

      case 'redo':
        setActions(prev => prev.map(a => a.id === msg.target ? { ...a, undone: false } : a));
        break;

      case 'canvas_cleared':
        setActions([]);
        setStreamingStrokes(new Map());
        setStatusText(`Canvas cleared by ${msg.user_name}`);
        showNotification(`🧹 Canvas cleared by ${msg.user_name}`);
        break;

      case 'cursor':
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.set(msg.user_code, {
            name: msg.user_name,
            color: msg.avatar_color,
            x: msg.x,
            y: msg.y
          });
          return next;
        });
        break;

      case 'chat_message':
        setChatMessages(prev => [...prev, msg]);
        break;

      case 'chat_cleared':
        setChatMessages([]);
        setStatusText('Chat history cleared');
        break;

      case 'new_milestone':
        setMilestones(prev => [msg.milestone, ...prev]);
        break;

      case 'snapshot_restored':
        setActions(msg.actions || []);
        setStatusText(`Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        showNotification(`🔄 Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        break;

      case 'connected_users_list':
        setConnectedUsers(msg.users || []);
        break;

      case 'notice':
        setStatusText(msg.text);
        showNotification(msg.text);
        break;

      case 'error':
        alert(msg.text);
        break;
    }
  };

  // ── RESIZE CANVAS BUFFERS ──────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (bgCanvasRef.current) {
        bgCanvasRef.current.width = w;
        bgCanvasRef.current.height = h;
      }
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
      redrawCanvas();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [actions, streamingStrokes, zoom, panOffset, gridMode, selectedTableId]);

  // ── DRAW INFINITE GRID ON BACKGROUND CANVAS LAYER ─────────────────
  const drawInfiniteGrid = useCallback((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (gridMode === 'none') return;

    const gridSize = 40 * zoom;
    const offsetX = ((panOffset.x % gridSize) + gridSize) % gridSize;
    const offsetY = ((panOffset.y % gridSize) + gridSize) % gridSize;

    ctx.save();
    if (gridMode === 'square') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = offsetX; x <= w; x += gridSize) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = offsetY; y <= h; y += gridSize) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    } else if (gridMode === 'dot') {
      ctx.fillStyle = '#94a3b8';
      const dotRadius = Math.max(1, 1.2 * Math.min(zoom, 1.5));
      for (let x = offsetX; x <= w; x += gridSize) {
        for (let y = offsetY; y <= h; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (gridMode === 'ruled') {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = offsetY; y <= h; y += gridSize) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [panOffset, zoom, gridMode]);

  // ── REDRAW CANVAS ENGINE ───────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    // 1. Draw Background Grid
    const bgCanvas = bgCanvasRef.current;
    if (bgCanvas) {
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) drawInfiniteGrid(bgCtx, bgCanvas.width, bgCanvas.height);
    }

    // 2. Draw Vector Actions & Ink
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Render committed actions
    for (const act of actions) {
      if (act.undone) continue;
      renderAction(ctx, act);
    }

    // Render peer streaming strokes
    for (const [, stroke] of streamingStrokes.entries()) {
      renderStroke(ctx, stroke.points, stroke.color, stroke.width, stroke.brush, stroke.opacity);
    }

    // Render local current stroke
    if (currentStroke && currentStroke.points.length > 0) {
      renderStroke(
        ctx,
        currentStroke.points,
        currentStroke.color,
        currentStroke.width,
        currentStroke.brush,
        currentStroke.opacity
      );
    }

    ctx.restore();
  }, [actions, streamingStrokes, currentStroke, zoom, panOffset, drawInfiniteGrid, selectedTableId]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Stroke renderer with support for Eraser using destination-out
  function renderStroke(ctx, points, color, width, brush, opacity = 1) {
    if (!points || points.length < 1) return;
    ctx.save();

    if (brush === 'eraser') {
      // Eraser clears only drawn strokes, leaving the background grid layer untouched!
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = width * 2;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = opacity;
    }

    ctx.lineCap = brush === 'highlighter' ? 'square' : 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  function renderAction(ctx, act) {
    ctx.save();
    ctx.strokeStyle = act.color || '#000000';
    ctx.fillStyle = act.fill || 'transparent';
    ctx.lineWidth = act.width || 3;
    ctx.globalAlpha = act.opacity || 1;

    switch (act.kind) {
      case 'stroke':
        renderStroke(ctx, act.points, act.color, act.width, act.brush, act.opacity);
        break;

      case 'rect':
        ctx.beginPath();
        ctx.rect(act.x, act.y, act.w, act.h);
        if (act.fill && act.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;

      case 'circle': {
        const rx = Math.abs(act.w / 2);
        const ry = Math.abs(act.h / 2);
        const cx = act.x + act.w / 2;
        const cy = act.y + act.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (act.fill && act.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'line':
        ctx.beginPath();
        ctx.moveTo(act.x1, act.y1);
        ctx.lineTo(act.x2, act.y2);
        ctx.stroke();
        break;

      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(act.x1, act.y1);
        ctx.lineTo(act.x2, act.y2);
        ctx.stroke();
        const angle = Math.atan2(act.y2 - act.y1, act.x2 - act.x1);
        const headlen = 16;
        ctx.beginPath();
        ctx.moveTo(act.x2, act.y2);
        ctx.lineTo(act.x2 - headlen * Math.cos(angle - Math.PI / 6), act.y2 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(act.x2, act.y2);
        ctx.lineTo(act.x2 - headlen * Math.cos(angle + Math.PI / 6), act.y2 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }

      case 'text':
        ctx.font = `${act.fontSize || 20}px ${act.fontFamily || 'Inter, sans-serif'}`;
        ctx.fillStyle = act.color || '#000000';
        ctx.fillText(act.text || '', act.x, act.y);
        break;

      case 'sticky':
        ctx.fillStyle = act.bgColor || '#fef08a';
        ctx.strokeStyle = '#fde047';
        ctx.beginPath();
        ctx.roundRect(act.x, act.y, act.w || 160, act.h || 120, [8]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#854d0e';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('STICKY NOTE', act.x + 10, act.y + 20);

        ctx.fillStyle = '#0f172a';
        ctx.font = '13px Caveat, cursive, sans-serif';
        ctx.fillText(act.text || '', act.x + 10, act.y + 44);
        break;

      case 'table': {
        const rows = Math.max(1, act.rows || 3);
        const cols = Math.max(1, act.cols || 3);
        const w = act.x1 - act.x0;
        const h = act.y1 - act.y0;
        const cellW = w / cols;
        const cellH = h / rows;

        // Table background
        ctx.fillStyle = act.fill || '#ffffff';
        ctx.fillRect(act.x0, act.y0, w, h);

        // Header row accent
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(act.x0, act.y0, w, cellH);

        // Table border and grid lines
        ctx.strokeStyle = act.color || '#334155';
        ctx.lineWidth = act.width || 1.5;
        ctx.strokeRect(act.x0, act.y0, w, h);

        // Rows
        for (let r = 1; r < rows; r++) {
          ctx.beginPath();
          ctx.moveTo(act.x0, act.y0 + r * cellH);
          ctx.lineTo(act.x1, act.y0 + r * cellH);
          ctx.stroke();
        }

        // Columns
        for (let c = 1; c < cols; c++) {
          ctx.beginPath();
          ctx.moveTo(act.x0 + c * cellW, act.y0);
          ctx.lineTo(act.x0 + c * cellW, act.y1);
          ctx.stroke();
        }

        // Render cell contents
        ctx.fillStyle = '#0f172a';
        ctx.font = '12px Inter, sans-serif';
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const val = act.cells?.[`${r},${c}`];
            if (val) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(act.x0 + c * cellW + 2, act.y0 + r * cellH + 2, cellW - 4, cellH - 4);
              ctx.clip();
              ctx.fillText(val, act.x0 + c * cellW + 8, act.y0 + r * cellH + cellH / 2 + 4);
              ctx.restore();
            }
          }
        }

        // Selected Table bounding box and handles
        if (selectedTableId === act.id) {
          ctx.save();
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(act.x0 - 2, act.y0 - 2, w + 4, h + 4);

          // Top Move Drag Bar
          ctx.setLineDash([]);
          ctx.fillStyle = '#2563eb';
          ctx.beginPath();
          ctx.roundRect(act.x0, act.y0 - 24, Math.min(180, w), 20, [6]);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillText(`⠿ Drag Table (${rows}x${cols})`, act.x0 + 8, act.y0 - 10);

          // Bottom-Right Resize Handle
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(act.x1 - 6, act.y1 - 6, 12, 12);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(act.x1 - 6, act.y1 - 6, 12, 12);
          ctx.restore();
        }
        break;
      }
    }
    ctx.restore();
  }

  // ── COORDINATE TRANSFORMATIONS (SCREEN <-> WORLD) ──────────────────
  const screenToWorld = useCallback((screenX, screenY) => {
    return {
      x: (screenX - panOffset.x) / zoom,
      y: (screenY - panOffset.y) / zoom
    };
  }, [panOffset, zoom]);

  const getCanvasCoords = (e) => {
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    return screenToWorld(clientX, clientY);
  };

  // ── MOUSE / POINTER EVENT HANDLERS ─────────────────────────────────
  const handlePointerDown = (e) => {
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    // Check middle-click or Pan tool
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: clientX, y: clientY, origX: panOffset.x, origY: panOffset.y });
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Check interaction with Tables (Resize or Drag or Cell Click)
    const tables = actions.filter(a => a.kind === 'table' && !a.undone);
    for (let i = tables.length - 1; i >= 0; i--) {
      const tbl = tables[i];
      const nearResize = Math.hypot(x - tbl.x1, y - tbl.y1) < 18 / zoom;
      if (nearResize && myPermissions.can_draw) {
        setSelectedTableId(tbl.id);
        setTableResize({
          id: tbl.id,
          startX: x,
          startY: y,
          origX1: tbl.x1,
          origY1: tbl.y1,
          cols: tbl.cols || 3,
          rows: tbl.rows || 3
        });
        return;
      }

      const insideTable = x >= tbl.x0 && x <= tbl.x1 && y >= tbl.y0 && y <= tbl.y1;
      const insideMoveBar = x >= tbl.x0 && x <= tbl.x0 + 180 && y >= tbl.y0 - 26 && y <= tbl.y0;

      if (insideTable || insideMoveBar) {
        setSelectedTableId(tbl.id);

        if (insideTable) {
          const cellW = (tbl.x1 - tbl.x0) / (tbl.cols || 3);
          const cellH = (tbl.y1 - tbl.y0) / (tbl.rows || 3);
          const r = Math.floor((y - tbl.y0) / cellH);
          const c = Math.floor((x - tbl.x0) / cellW);

          // If clicked in cell and already selected or on second click -> edit cell text
          if (selectedTableId === tbl.id && myPermissions.can_draw) {
            const currentVal = tbl.cells?.[`${r},${c}`] || '';
            const newVal = prompt(`Edit Table Cell (${r + 1}, ${c + 1}):`, currentVal);
            if (newVal !== null) {
              const updatedTable = {
                ...tbl,
                cells: {
                  ...(tbl.cells || {}),
                  [`${r},${c}`]: newVal
                }
              };
              commitAction(updatedTable);
              return;
            }
          }
        }

        // Drag table
        if (myPermissions.can_draw) {
          setTableDrag({
            id: tbl.id,
            startX: x,
            startY: y,
            origX0: tbl.x0,
            origY0: tbl.y0,
            origX1: tbl.x1,
            origY1: tbl.y1
          });
        }
        return;
      }
    }

    // Unselect table if clicked elsewhere
    if (selectedTableId) {
      setSelectedTableId(null);
    }

    // Permission Enforcement
    if (!myPermissions.can_draw) {
      showNotification('🔒 Drawing is disabled for you by the Host.');
      return;
    }

    setIsDrawing(true);

    if (['pencil', 'brush', 'highlighter', 'eraser'].includes(activeTool)) {
      const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const strokeObj = {
        id: strokeId,
        kind: 'stroke',
        points: [[x, y]],
        color: activeTool === 'eraser' ? '#000000' : strokeColor,
        width: activeTool === 'eraser' ? strokeWidth * 2.5 : strokeWidth,
        brush: activeTool,
        opacity: activeTool === 'highlighter' ? 0.45 : 1
      };
      setCurrentStroke(strokeObj);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stroke_pts',
          id: strokeId,
          points: [[x, y]],
          color: strokeObj.color,
          width: strokeObj.width,
          brush: strokeObj.brush,
          opacity: strokeObj.opacity
        }));
      }
    } else if (activeTool === 'shape') {
      setShapeStart({ x, y });
    } else if (activeTool === 'text') {
      const text = prompt('Enter text for canvas:');
      if (text) {
        const textAction = {
          id: `text_${Date.now()}`,
          kind: 'text',
          text,
          x,
          y,
          color: strokeColor,
          fontSize: strokeWidth * 5 + 12,
          fontFamily: 'Inter, sans-serif'
        };
        commitAction(textAction);
      }
      setIsDrawing(false);
    } else if (activeTool === 'sticky') {
      const text = prompt('Enter note text:');
      if (text) {
        const stickyAction = {
          id: `sticky_${Date.now()}`,
          kind: 'sticky',
          text,
          x,
          y,
          w: 160,
          h: 120,
          bgColor: '#fef08a'
        };
        commitAction(stickyAction);
      }
      setIsDrawing(false);
    }
  };

  const handlePointerMove = (e) => {
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    // Handle Infinite Canvas Panning
    if (isPanning) {
      setPanOffset({
        x: panStart.origX + (clientX - panStart.x),
        y: panStart.origY + (clientY - panStart.y)
      });
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Broadcast cursor position to peers (throttled)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cursor', x, y }));
    }

    // Handle Table Resizing
    if (tableResize) {
      const dx = x - tableResize.startX;
      const dy = y - tableResize.startY;
      const minW = tableResize.cols * 40;
      const minH = tableResize.rows * 25;

      setActions(prev => prev.map(a => {
        if (a.id === tableResize.id) {
          return {
            ...a,
            x1: Math.max(a.x0 + minW, tableResize.origX1 + dx),
            y1: Math.max(a.y0 + minH, tableResize.origY1 + dy)
          };
        }
        return a;
      }));
      return;
    }

    // Handle Table Dragging
    if (tableDrag) {
      const dx = x - tableDrag.startX;
      const dy = y - tableDrag.startY;

      setActions(prev => prev.map(a => {
        if (a.id === tableDrag.id) {
          return {
            ...a,
            x0: tableDrag.origX0 + dx,
            y0: tableDrag.origY0 + dy,
            x1: tableDrag.origX1 + dx,
            y1: tableDrag.origY1 + dy
          };
        }
        return a;
      }));
      return;
    }

    if (!isDrawing) return;

    if (currentStroke) {
      const updatedPts = [...currentStroke.points, [x, y]];
      setCurrentStroke(prev => ({ ...prev, points: updatedPts }));

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stroke_pts',
          id: currentStroke.id,
          points: [[x, y]],
          color: currentStroke.color,
          width: currentStroke.width,
          brush: currentStroke.brush,
          opacity: currentStroke.opacity
        }));
      }
    }
  };

  const handlePointerUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (tableResize) {
      const modified = actions.find(a => a.id === tableResize.id);
      if (modified) commitAction(modified);
      setTableResize(null);
      return;
    }

    if (tableDrag) {
      const modified = actions.find(a => a.id === tableDrag.id);
      if (modified) commitAction(modified);
      setTableDrag(null);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStroke && currentStroke.points.length > 0) {
      commitAction(currentStroke);
      setCurrentStroke(null);
    } else if (activeTool === 'shape' && shapeStart) {
      const { x, y } = getCanvasCoords(e);
      const w = x - shapeStart.x;
      const h = y - shapeStart.y;
      const shapeId = `shape_${Date.now()}`;

      let shapeAction = null;
      if (activeShape === 'rect') {
        shapeAction = {
          id: shapeId,
          kind: 'rect',
          x: Math.min(shapeStart.x, x),
          y: Math.min(shapeStart.y, y),
          w: Math.abs(w),
          h: Math.abs(h),
          color: strokeColor,
          width: strokeWidth
        };
      } else if (activeShape === 'circle') {
        shapeAction = {
          id: shapeId,
          kind: 'circle',
          x: Math.min(shapeStart.x, x),
          y: Math.min(shapeStart.y, y),
          w: Math.abs(w),
          h: Math.abs(h),
          color: strokeColor,
          width: strokeWidth
        };
      } else if (activeShape === 'line' || activeShape === 'arrow') {
        shapeAction = {
          id: shapeId,
          kind: activeShape,
          x1: shapeStart.x,
          y1: shapeStart.y,
          x2: x,
          y2: y,
          color: strokeColor,
          width: strokeWidth
        };
      }

      if (shapeAction) {
        commitAction(shapeAction);
      }
      setShapeStart(null);
    }
  };

  // ── WHEEL SCROLL FOR INFINITE ZOOM & PAN ───────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = Math.max(0.2, Math.min(3.0, zoom * zoomFactor));
      setZoom(newZoom);
    } else {
      setPanOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  // ── ACTION DISPATCHER & COMMIT ──────────────────────────────────────
  const commitAction = (action) => {
    setActions(prev => {
      const filtered = prev.filter(a => a.id !== action.id);
      return [...filtered, action];
    });
    setRedoStack([]);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'action',
        action
      }));
    }
  };

  // ── TABLE CREATION HANDLER ──────────────────────────────────────────
  const handleCreateTable = (rows, cols) => {
    const centerWorld = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const tableW = cols * 90;
    const tableH = rows * 38;

    const newTable = {
      id: `table_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      kind: 'table',
      x0: Math.round(centerWorld.x - tableW / 2),
      y0: Math.round(centerWorld.y - tableH / 2),
      x1: Math.round(centerWorld.x + tableW / 2),
      y1: Math.round(centerWorld.y + tableH / 2),
      rows,
      cols,
      cells: {},
      color: '#1e293b',
      fill: '#ffffff',
      width: 1.5
    };

    commitAction(newTable);
    setSelectedTableId(newTable.id);
    showNotification(`📊 Table created (${rows}x${cols}). Drag to move or click cells to edit.`);
  };

  // ── UNDO / REDO / CLEAR ─────────────────────────────────────────────
  const handleUndo = () => {
    const activeActions = actions.filter(a => !a.undone);
    if (activeActions.length === 0) return;
    const last = activeActions[activeActions.length - 1];

    setActions(prev => prev.map(a => a.id === last.id ? { ...a, undone: true } : a));
    setRedoStack(prev => [...prev, last.id]);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'undo', target: last.id }));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const redoId = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    setActions(prev => prev.map(a => a.id === redoId ? { ...a, undone: false } : a));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'redo', target: redoId }));
    }
  };

  const handleClearCanvas = () => {
    if (!isHost && !isCohost) {
      alert('Only the host or co-host can clear the canvas for all participants.');
      return;
    }
    if (window.confirm('Clear all drawings and items on the whiteboard?')) {
      setActions([]);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'clear_canvas' }));
      }
    }
  };

  // ── INK-TO-FONT HANDWRITING ENGINE ─────────────────────────────────
  const handleInkToFont = () => {
    const strokeActions = actions.filter(a => a.kind === 'stroke' && !a.undone);
    if (strokeActions.length === 0) {
      alert('Draw some letters, cursive words, numbers, or symbols with the pen first!');
      return;
    }

    const { text, bbox } = recognizeInkStrokes(strokeActions);
    if (!text) {
      alert('Could not recognize text from the current ink strokes.');
      return;
    }

    // Replace handwritten strokes with crisp typography text action
    const textAction = {
      id: `inkfont_${Date.now()}`,
      kind: 'text',
      text,
      x: bbox.minX,
      y: bbox.maxY,
      color: strokeColor,
      fontSize: Math.max(20, Math.min(48, (bbox.maxY - bbox.minY) * 0.9)),
      fontFamily: 'Inter, system-ui, sans-serif'
    };

    strokeActions.forEach(s => {
      s.undone = true;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'undo', target: s.id }));
      }
    });

    commitAction(textAction);
    showNotification(`✨ Converted handwriting to: "${text}"`);
  };

  // ── HOST CONTROLS (BLOCK ALL / ALLOW ALL / TOGGLE DRAW) ────────────
  const handleBlockAll = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'block_all'
      }));
    }
  };

  const handleAllowAll = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'allow_all'
      }));
    }
  };

  const handleToggleDraw = (targetUserCode, canDraw) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'toggle_draw',
        target_user_code: targetUserCode,
        can_draw: canDraw
      }));
    }
  };

  const handlePromoteCohost = (targetUserCode, isCohostVal) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'promote_cohost',
        target_user_code: targetUserCode,
        is_cohost: isCohostVal
      }));
    }
  };

  const handleKickMember = (targetUserCode) => {
    if (window.confirm('Remove this member from the session?')) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'host_control',
          action: 'kick',
          target_user_code: targetUserCode
        }));
      }
    }
  };

  const handleAddMember = (target) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'add_member',
        target
      }));
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleResetView = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
    showNotification('🎯 Canvas view reset to center');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-100 font-sans">
      {/* Top Left Navigation Header */}
      <div className="fixed top-3 left-3 z-20 flex items-center gap-2">
        <button
          onClick={onBackToHub}
          className="p-2 bg-white/95 backdrop-blur-md hover:bg-slate-100 text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Hub</span>
        </button>

        {/* Room Code Badge */}
        <div
          onClick={copyRoomCode}
          title="Click to copy Room Code"
          className="px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 cursor-pointer hover:bg-slate-50 transition flex items-center gap-2"
        >
          <span className="text-xs font-bold text-slate-800 line-clamp-1 max-w-[120px] sm:max-w-xs">{room.title}</span>
          <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 font-mono font-bold text-xs">
            {room.code}
          </span>
          {copiedCode && <span className="text-[10px] text-green-600 font-bold">Copied!</span>}
        </div>
      </div>

      {/* Floating Center Notification Toast */}
      {roomNotification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white rounded-full shadow-2xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-fade-in pointer-events-none">
          <span>{roomNotification}</span>
        </div>
      )}

      {/* Blocked View-Only Banner */}
      {!myPermissions.can_draw && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 bg-red-600/95 backdrop-blur-md text-white rounded-full shadow-lg text-xs font-bold flex items-center gap-2 animate-fade-in">
          <Lock className="w-3.5 h-3.5" />
          <span>You are in View-Only mode. Drawing is paused by the Host.</span>
        </div>
      )}

      {/* Top Floating Primary Toolbar */}
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        activeShape={activeShape}
        setActiveShape={setActiveShape}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        gridMode={gridMode}
        setGridMode={setGridMode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearCanvas={handleClearCanvas}
        onInkToFont={handleInkToFont}
        onOpenTableModal={() => setIsTableModalOpen(true)}
        onResetView={handleResetView}
        canUndo={actions.some(a => !a.undone)}
        canRedo={redoStack.length > 0}
        zoom={zoom}
        setZoom={setZoom}
        canDraw={myPermissions.can_draw}
      />

      {/* Top Right Drawer Toggles */}
      <div className="fixed top-3 right-3 z-20 flex items-center gap-1.5">
        {/* Add Member button (Host & Co-host) */}
        {(isHost || isCohost) && (
          <button
            onClick={() => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'list_connected_users' }));
              }
              setIsAddMemberOpen(true);
            }}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition flex items-center gap-1.5 text-xs font-bold"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Member</span>
          </button>
        )}

        <button
          onClick={() => setIsMilestonesOpen(true)}
          className="p-2 bg-white/95 backdrop-blur-md hover:bg-slate-100 text-slate-700 rounded-xl shadow-md border border-slate-200 transition"
          title="Milestone Instances"
        >
          <History className="w-4 h-4 text-violet-600" />
        </button>

        <button
          onClick={() => {
            setIsParticipantsOpen(!isParticipantsOpen);
            setIsChatOpen(false);
          }}
          className={`px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold ${isParticipantsOpen ? 'ring-2 ring-blue-500' : ''}`}
        >
          <Users className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">{members.length}</span>
        </button>

        <button
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            setIsParticipantsOpen(false);
          }}
          className={`px-3 py-2 bg-white/95 backdrop-blur-md text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold ${isChatOpen ? 'ring-2 ring-blue-500' : ''}`}
        >
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">Chat</span>
        </button>
      </div>

      {/* Background Infinite Grid Layer */}
      <canvas
        ref={bgCanvasRef}
        className="absolute inset-0 z-0 bg-[#ffffff] pointer-events-none"
      />

      {/* Main Transparent Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className={`whiteboard-canvas absolute inset-0 z-1 touch-none ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
          !myPermissions.can_draw ? 'cursor-not-allowed' : 'cursor-crosshair'
        }`}
      />

      {/* Remote User Cursors Overlay */}
      {Array.from(remoteCursors.entries()).map(([code, cur]) => (
        <div
          key={code}
          style={{
            transform: `translate(${cur.x * zoom + panOffset.x}px, ${cur.y * zoom + panOffset.y}px)`,
            transition: 'transform 0.08s ease-out'
          }}
          className="absolute top-0 left-0 pointer-events-none z-10 flex items-center gap-1.5"
        >
          <svg className="w-5 h-5 -rotate-45" viewBox="0 0 24 24" fill={cur.color || '#2563eb'}>
            <path d="M3 3l7 18 3-7 7-3L3 3z" />
          </svg>
          <span
            style={{ backgroundColor: cur.color || '#2563eb' }}
            className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold shadow-md whitespace-nowrap"
          >
            {cur.name}
          </span>
        </div>
      ))}

      {/* Drawers: Participants & Chat */}
      <div className="fixed top-0 right-0 h-full z-30 flex">
        <ParticipantsDrawer
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          members={members}
          currentUserCode={user?.user_code}
          isHost={isHost}
          isCohost={isCohost}
          onToggleDraw={handleToggleDraw}
          onBlockAll={handleBlockAll}
          onAllowAll={handleAllowAll}
          onPromoteCohost={handlePromoteCohost}
          onKickMember={handleKickMember}
          onOpenAddMember={() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'list_connected_users' }));
            }
            setIsAddMemberOpen(true);
          }}
        />

        <ChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={(msg) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'chat_message', message: msg }));
            }
          }}
          onClearChat={() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'clear_chat' }));
            }
          }}
          isHost={isHost}
          currentUserCode={user?.user_code}
        />
      </div>

      {/* Modals */}
      <TableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        onCreateTable={handleCreateTable}
      />

      <InstancesModal
        isOpen={isMilestonesOpen}
        onClose={() => setIsMilestonesOpen(false)}
        milestones={milestones}
        onSaveMilestone={(title) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'save_milestone', title, snapshot: actions }));
          }
        }}
        onRestoreMilestone={(snapshot, title) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'restore_milestone', actions: snapshot, title }));
          }
        }}
        canRestore={isHost || isCohost}
        canSave={true}
      />

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onAddMember={handleAddMember}
        connectedUsers={connectedUsers}
      />

      {/* Bottom Status Pill */}
      <div className="fixed bottom-3 left-4 z-20 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full shadow-md border border-slate-200 text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {statusText}
      </div>
    </div>
  );
}
