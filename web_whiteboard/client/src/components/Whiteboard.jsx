import React, { useRef, useEffect, useState, useCallback } from 'react';
import Toolbar from './Toolbar';
import ParticipantsDrawer from './ParticipantsDrawer';
import ChatDrawer from './ChatDrawer';
import InstancesModal from './InstancesModal';
import AddMemberModal from './AddMemberModal';
import { recognizeInkStrokes } from '../utils/inkToFont';
import {
  Users,
  MessageSquare,
  Camera,
  Share2,
  Lock,
  ArrowLeft,
  Check,
  Copy,
  Wifi,
  Radio
} from 'lucide-react';

export default function Whiteboard({
  room,
  user,
  onBackToHub,
  ws,
  isOffline = false
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Tools & Styling state
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeShape, setActiveShape] = useState('rect');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Canvas Action Records
  const [actions, setActions] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);

  // Active remote cursors & streaming strokes
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [streamingStrokes, setStreamingStrokes] = useState(new Map());

  // Room state
  const [roomData, setRoomData] = useState(room);
  const [members, setMembers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [myPermissions, setMyPermissions] = useState({ can_draw: true, role: 'member' });

  // Drawer & Modal states
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMilestonesOpen, setIsMilestonesOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusText, setStatusText] = useState('Connected to session');

  const isHost = roomData?.host_user_code === user?.user_code || isOffline;
  const isCohost = myPermissions?.role === 'cohost';

  // ── WEBSOCKET MESSAGE LISTENER ─────────────────────────────────────
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('[!] Failed to parse WS message:', err);
      }
    };

    ws.addEventListener('message', handleMessage);

    // Initial Join Room request
    if (ws.readyState === WebSocket.OPEN && room?.code) {
      ws.send(JSON.stringify({
        type: 'join_room',
        room_code: room.code,
        user_code: user.user_code,
        user_name: user.name,
        avatar_color: user.avatar_color
      }));
    }

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, room?.code]);

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
        break;

      case 'user_left':
        setMembers(msg.members || []);
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.delete(msg.user_code);
          return next;
        });
        break;

      case 'members_updated':
      case 'room_settings_updated':
        if (msg.members) setMembers(msg.members);
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
        // Commit action from peer
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
        break;

      case 'connected_users_list':
        setConnectedUsers(msg.users || []);
        break;

      case 'notice':
        setStatusText(msg.text);
        break;

      case 'error':
        alert(msg.text);
        break;
    }
  };

  // ── RESIZE CANVAS ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawCanvas();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [actions, streamingStrokes, zoom, panOffset]);

  // ── CANVAS REDRAW ENGINE ───────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw grid background
    drawGrid(ctx, canvas.width / zoom, canvas.height / zoom);

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
  }, [actions, streamingStrokes, currentStroke, zoom, panOffset]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  function drawGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < w * 2; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h * 2);
      ctx.stroke();
    }
    for (let y = 0; y < h * 2; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w * 2, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderStroke(ctx, points, color, width, brush, opacity = 1) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opacity;
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

        // Arrow head
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
        ctx.roundRect(act.x, act.y, act.w || 140, act.h || 120, [8]);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#854d0e';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('STICKY NOTE', act.x + 10, act.y + 20);

        ctx.fillStyle = '#0f172a';
        ctx.font = '13px Caveat, cursive, sans-serif';
        ctx.fillText(act.text || '', act.x + 10, act.y + 44);
        break;
    }
    ctx.restore();
  }

  // ── MOUSE / DRAWING HANDLERS ───────────────────────────────────────
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom
    };
  };

  const handlePointerDown = (e) => {
    if (!myPermissions.can_draw) return;
    const { x, y } = getCanvasCoords(e);
    setIsDrawing(true);

    if (['pencil', 'brush', 'highlighter', 'eraser'].includes(activeTool)) {
      const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const strokeObj = {
        id: strokeId,
        kind: 'stroke',
        points: [[x, y]],
        color: activeTool === 'eraser' ? '#ffffff' : strokeColor,
        width: activeTool === 'eraser' ? strokeWidth * 3 : strokeWidth,
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
    const { x, y } = getCanvasCoords(e);

    // Broadcast cursor position to peers (throttled)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cursor', x, y }));
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
      if (activeShape === 'rect' || activeShape === 'circle') {
        shapeAction = {
          id: shapeId,
          kind: activeShape,
          x: w < 0 ? x : shapeStart.x,
          y: h < 0 ? y : shapeStart.y,
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

  const commitAction = (action) => {
    setActions(prev => [...prev, action]);
    setRedoStack([]);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'action', action }));
    }
  };

  // ── INK TO FONT CONVERSION ─────────────────────────────────────────
  const handleInkToFont = () => {
    // Collect the most recent un-undone stroke actions
    const candidateStrokes = actions.filter(a => a.kind === 'stroke' && !a.undone).slice(-4);
    if (candidateStrokes.length === 0) {
      alert('Please draw some handwriting or symbols first, then click "Ink to Text"!');
      return;
    }

    const recognized = recognizeInkStrokes(candidateStrokes);
    if (!recognized) {
      alert('Could not detect distinct ink strokes. Try drawing clearly on canvas.');
      return;
    }

    // Mark previous strokes as undone
    candidateStrokes.forEach(s => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'undo', target: s.id }));
      }
    });

    // Create converted Typography Text action
    const textAction = {
      id: `font_${Date.now()}`,
      kind: 'text',
      text: recognized.text,
      x: recognized.bounds.x,
      y: recognized.bounds.y + recognized.bounds.height,
      color: strokeColor,
      fontSize: Math.max(22, Math.round(recognized.bounds.height * 0.9)),
      fontFamily: recognized.isWord ? 'Caveat, cursive, sans-serif' : 'Inter, sans-serif'
    };

    commitAction(textAction);
    setStatusText(`Converted handwriting into typography: "${recognized.text}"`);
  };

  // ── UNDO / REDO / CLEAR ────────────────────────────────────────────
  const handleUndo = () => {
    const lastActive = [...actions].reverse().find(a => !a.undone);
    if (!lastActive) return;

    setActions(prev => prev.map(a => a.id === lastActive.id ? { ...a, undone: true } : a));
    setRedoStack(prev => [...prev, lastActive.id]);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'undo', target: lastActive.id }));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const targetId = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    setActions(prev => prev.map(a => a.id === targetId ? { ...a, undone: false } : a));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'redo', target: targetId }));
    }
  };

  const handleClearCanvas = () => {
    if (!isHost) {
      alert('Only the host can clear the whiteboard canvas.');
      return;
    }
    if (confirm('Clear the entire whiteboard canvas?')) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'clear_canvas' }));
      } else {
        setActions([]);
      }
    }
  };

  // ── HOST CONTROLS ──────────────────────────────────────────────────
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

  const handlePromoteCohost = (targetUserCode, isCohost) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'promote_cohost',
        target_user_code: targetUserCode,
        is_cohost: isCohost
      }));
    }
  };

  const handleKickMember = (targetUserCode) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'kick',
        target_user_code: targetUserCode
      }));
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

  const copyRoomInvite = () => {
    const inviteText = `Join my Whiteboard session!\nRoom: ${roomData.title}\nCode: ${roomData.code}\nLink: ${window.location.origin}`;
    navigator.clipboard.writeText(inviteText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div ref={containerRef} className="relative w-screen h-screen overflow-hidden bg-white select-none">
      {/* Top Navbar */}
      <div className="fixed top-4 left-4 z-20 flex items-center gap-2">
        <button
          onClick={onBackToHub}
          className="p-2.5 bg-white/90 backdrop-blur-md hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Hub</span>
        </button>

        {/* Room Title Badge */}
        <div className="px-3.5 py-2 bg-white/90 backdrop-blur-md rounded-xl shadow-md border border-slate-200 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="font-bold text-xs text-slate-800">{roomData?.title || 'Whiteboard'}</span>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono text-[11px] font-bold rounded">
            {roomData?.code}
          </span>
          {roomData?.locked ? (
            <span className="text-red-500 text-xs flex items-center gap-0.5">
              <Lock className="w-3 h-3" /> Locked
            </span>
          ) : null}
        </div>

        {/* Share Button */}
        <button
          onClick={copyRoomInvite}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md font-bold text-xs flex items-center gap-1.5 transition"
        >
          {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copiedCode ? 'Copied' : 'Share'}</span>
        </button>
      </div>

      {/* Floating Toolbar */}
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        activeShape={activeShape}
        setActiveShape={setActiveShape}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearCanvas={handleClearCanvas}
        onInkToFont={handleInkToFont}
        canUndo={actions.some(a => !a.undone)}
        canRedo={redoStack.length > 0}
        zoom={zoom}
        setZoom={setZoom}
        canDraw={myPermissions.can_draw}
      />

      {/* Top Right Drawer Toggles */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setIsMilestonesOpen(true)}
          className="p-2.5 bg-white/90 backdrop-blur-md hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-semibold"
          title="Session Milestones / Instances"
        >
          <Camera className="w-4 h-4 text-teal-600" />
          <span className="hidden sm:inline">Milestones ({milestones.length})</span>
        </button>

        <button
          onClick={() => {
            setIsParticipantsOpen(!isParticipantsOpen);
            setIsChatOpen(false);
          }}
          className={`p-2.5 bg-white/90 backdrop-blur-md hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-semibold ${isParticipantsOpen ? 'ring-2 ring-blue-500' : ''}`}
        >
          <Users className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">People ({members.length})</span>
        </button>

        <button
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            setIsParticipantsOpen(false);
          }}
          className={`p-2.5 bg-white/90 backdrop-blur-md hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 transition flex items-center gap-1.5 text-xs font-semibold ${isChatOpen ? 'ring-2 ring-blue-500' : ''}`}
        >
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">Chat</span>
        </button>
      </div>

      {/* Main HTML5 Collaborative Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="whiteboard-canvas absolute inset-0 z-0 bg-[#ffffff]"
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

