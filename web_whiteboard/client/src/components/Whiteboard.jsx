import React, { useRef, useEffect, useState, useCallback } from 'react';
import Toolbar from './Toolbar';
import ParticipantsDrawer from './ParticipantsDrawer';
import ChatDrawer from './ChatDrawer';
import InstancesModal from './InstancesModal';
import AddMemberModal from './AddMemberModal';
import TableModal from './TableModal';
import ShapesModal, { SHAPES_LIST } from './ShapesModal';
import ExportModal from './ExportModal';
import PublicWorksModal from './PublicWorksModal';
import SaveDestinationModal from './SaveDestinationModal';
import ErrorBoundary from './ErrorBoundary';
import { recognizeInkStrokes } from '../utils/inkToFont';
import {
  Users,
  MessageSquare,
  History,
  UserPlus,
  ArrowLeft,
  Check,
  Lock,
  Download,
  Hand,
  RotateCcw,
  Camera,
  Image as ImageIcon,
  Save,
  Radio,
  Eye,
  SquareDashedMousePointer,
  Upload,
  Bold,
  Italic,
  Type,
  Trash2,
  Sparkles,
  Globe,
  HardDrive,
  Sliders
} from 'lucide-react';

export default function Whiteboard({
  room,
  user,
  onBackToHub,
  ws,
  isOffline = false
}) {
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const whiteboardFileInputRef = useRef(null);

  // Tools & Styling State
  const [activeTool, setActiveTool] = useState('pencil'); // 'select' | 'pan' | 'pencil' | 'brush' | 'highlighter' | 'eraser' | 'shape' | 'table' | 'text' | 'sticky'
  const [activeShape, setActiveShape] = useState('rect');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fillShape, setFillShape] = useState(false);
  const [fillColor, setFillColor] = useState('#3b82f6');
  const [gridMode, setGridMode] = useState('square'); // 'square' | 'dot' | 'ruled' | 'none'

  // Textbox Typography & Styling State
  const [activeFontFamily, setActiveFontFamily] = useState('Inter, sans-serif');
  const [activeFontSize, setActiveFontSize] = useState(24);
  const [activeFontBold, setActiveFontBold] = useState(false);
  const [activeFontItalic, setActiveFontItalic] = useState(false);

  // Infinite Canvas Pan & Zoom State
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Drawing Canvas Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [shapeStart, setShapeStart] = useState(null);
  const [currentPreviewPoint, setCurrentPreviewPoint] = useState(null);
  const [streamingStrokes, setStreamingStrokes] = useState(new Map());

  // Instance Sandbox View State
  const [viewingInstance, setViewingInstance] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('sandbox') === 'true') {
        return {
          id: 'ms_demo_1',
          title: 'Sprint 1 Architecture Sandbox',
          actions: [],
          original_snapshot: [],
          host_sandbox: []
        };
      }
    } catch(e) {}
    return null;
  }); // null | { id, title, actions: [...], original_snapshot: [...], host_sandbox: [...] }
  const [sandboxViewMode, setSandboxViewMode] = useState('sandbox'); // 'original' | 'sandbox' | 'host_sandbox'

  // Selection & Manipulation State
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDrag, setSelectedDrag] = useState(null);
  const [selectedResize, setSelectedResize] = useState(null);

  // Infinite Pan Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, origX: 0, origY: 0 });

  // Table Tool State
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [tableDrag, setTableDrag] = useState(null);
  const [tableResize, setTableResize] = useState(null);

  // Sticky Note Tool State
  const [stickyDrag, setStickyDrag] = useState(null);
  const [stickyResize, setStickyResize] = useState(null);

  // Room & Peer State
  const [roomData, setRoomData] = useState(room);
  const [members, setMembers] = useState(() => room?.members || []);
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [actions, setActions] = useState(() => {
    if (isOffline && room?.code) {
      try {
        const cached = localStorage.getItem(`offline_actions_${room.code}`);
        if (cached) return JSON.parse(cached);
      } catch (e) {
        console.error(e);
      }
    }
    return room?.actions || [];
  });
  const [redoStack, setRedoStack] = useState([]);
  const [chatMessages, setChatMessages] = useState(() => room?.chat || []);
  const [milestones, setMilestones] = useState(() => {
    if (room?.milestones && Array.isArray(room.milestones)) return room.milestones;
    if (isOffline && room?.code) {
      try {
        const cached = localStorage.getItem(`offline_milestones_${room.code}`);
        if (cached) return JSON.parse(cached);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [publicWorks, setPublicWorks] = useState(() => {
    if (isOffline) {
      try {
        const stored = localStorage.getItem(`offline_public_works_${room?.code || 'local'}`);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [myPermissions, setMyPermissions] = useState({
    can_draw: true,
    can_chat: true,
    can_instances: true,
    can_public_work: true,
    role: 'host'
  });

  // Private Local Gallery State (Personal System Only)
  const [privateMilestones, setPrivateMilestones] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('my_private_instances') || '[]');
    } catch {
      return [];
    }
  });
  const [privateScreenshots, setPrivateScreenshots] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('my_private_screenshots') || '[]');
    } catch {
      return [];
    }
  });

  // Save Destination Modal Config (2 Options: Private vs Public Works)
  const [saveModalConfig, setSaveModalConfig] = useState(null); // null | { mode: 'screenshot' | 'instance', defaultTitle: string }

  // Drawers & Modals
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('participants') === 'true'; } catch(e){ return false; }
  });
  const [isChatOpen, setIsChatOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('chat') === 'true'; } catch(e){ return false; }
  });
  const [isMilestonesOpen, setIsMilestonesOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('instances') === 'true'; } catch(e){ return false; }
  });
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isShapesModalOpen, setIsShapesModalOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('shapes') === 'true'; } catch(e){ return false; }
  });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPublicWorksOpen, setIsPublicWorksOpen] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('public_works') === 'true'; } catch(e){ return false; }
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusText, setStatusText] = useState(isOffline ? 'Offline Personal Workspace' : 'Connected to session');
  const [roomNotification, setRoomNotification] = useState(null);

  // Current display actions (switches dynamically between live room and sandbox instance modes)
  const currentDisplayActions = viewingInstance
    ? (sandboxViewMode === 'original'
        ? (viewingInstance.original_snapshot || viewingInstance.actions || [])
        : sandboxViewMode === 'host_sandbox'
        ? (viewingInstance.host_sandbox || viewingInstance.actions || [])
        : (viewingInstance.actions || []))
    : actions;

  // Persist offline actions & milestones
  useEffect(() => {
    if (isOffline && room?.code) {
      try {
        localStorage.setItem(`offline_actions_${room.code}`, JSON.stringify(actions));
      } catch (e) {
        console.error(e);
      }
    }
  }, [actions, isOffline, room?.code]);

  useEffect(() => {
    if (isOffline && room?.code) {
      try {
        localStorage.setItem(`offline_milestones_${room.code}`, JSON.stringify(milestones));
      } catch (e) {
        console.error(e);
      }
    }
  }, [milestones, isOffline, room?.code]);

  const isHost = roomData?.host_user_code === user?.user_code || isOffline;
  const isCohost = myPermissions.role === 'cohost';
  const hasTopBanner = Boolean(viewingInstance || (!myPermissions.can_draw && !viewingInstance));
  const selectedAction = selectedId ? currentDisplayActions.find(a => a.id === selectedId && !a.undone) : null;

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

    const sendJoin = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'join_room',
          room_code: room.code,
          user_code: user?.user_code,
          user_name: user?.name,
          avatar_color: user?.avatar_color
        }));
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendJoin();
    } else {
      ws.addEventListener('open', sendJoin, { once: true });
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
      ws.removeEventListener('open', sendJoin);
      ws.removeEventListener('message', onMessage);
    };
  }, [room.code, ws, isOffline, user]);

  const handleServerMessage = (msg) => {
    switch (msg.type) {
      case 'join_ack':
        setRoomData(msg.room);
        if (msg.room?.grid_style) {
          setGridMode(msg.room.grid_style);
        }
        setMyPermissions(msg.my_permissions || {
          can_draw: true,
          can_chat: true,
          can_instances: true,
          can_public_work: true,
          role: 'member'
        });
        setMembers(msg.members || []);
        setActions(msg.actions || []);
        setChatMessages(msg.chat || []);
        setMilestones(msg.milestones || []);
        setPublicWorks(msg.public_works || []);
        setStatusText(`Connected to ${msg.room.title}`);
        break;

      case 'grid_style_updated':
        setGridMode(msg.grid_style);
        showNotification(`Canvas Grid updated to: ${msg.grid_style.toUpperCase()}`);
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

      case 'permissions_updated':
        if (msg.my_permissions) {
          const prevDraw = myPermissions.can_draw;
          setMyPermissions(msg.my_permissions);
          if (prevDraw && !msg.my_permissions.can_draw) {
            showNotification('🔒 Drawing is paused for you by the Host.');
          } else if (!prevDraw && msg.my_permissions.can_draw) {
            showNotification('🔓 Drawing has been enabled for you by the Host.');
          }
        }
        if (msg.members) setMembers(msg.members);
        if (msg.room) setRoomData(msg.room);
        break;

      case 'members_updated':
      case 'room_settings_updated':
        if (msg.members) {
          setMembers(msg.members);
          const me = msg.members.find(m => m.user_code === user?.user_code);
          if (me) {
            setMyPermissions(prev => ({
              ...prev,
              can_draw: Boolean(me.can_draw),
              can_chat: Boolean(me.can_chat),
              can_instances: Boolean(me.can_instances),
              can_public_work: Boolean(me.can_public_work),
              role: me.role
            }));
            if (!me.can_draw) {
              showNotification('🔒 Drawing is paused for you by the Host.');
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
        setViewingInstance(null);
        setActions(msg.actions || []);
        setStatusText(`Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        showNotification(`🔄 Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        break;

      case 'new_public_work':
        setPublicWorks(prev => [msg.public_work, ...prev]);
        showNotification(`🖼️ ${msg.public_work.author_name} published a screenshot to Public Works!`);
        break;

      case 'public_work_deleted':
        setPublicWorks(prev => prev.filter(p => p.id !== msg.id));
        break;

      case 'milestone_deleted':
        setMilestones(prev => prev.filter(m => m.id !== msg.id));
        showNotification('Instance removed');
        break;

      case 'error':
        showNotification(`⚠️ ${msg.text || 'Action error'}`);
        break;

      case 'instance_snapshot_updated':
        setMilestones(prev => prev.map(m => m.id === msg.instance_id ? { ...m, snapshot: msg.snapshot } : m));
        if (viewingInstance && viewingInstance.id === msg.instance_id) {
          setViewingInstance(prev => ({ ...prev, actions: msg.snapshot }));
        }
        showNotification('Milestone instance snapshot updated');
        break;

      case 'show_instance_broadcast':
        setViewingInstance({
          id: msg.instance_id,
          title: msg.title,
          actions: msg.actions || []
        });
        showNotification(`📡 Host presented instance "${msg.title}" to everyone`);
        break;

      case 'connected_users_list':
        setConnectedUsers(msg.users || []);
        break;

      case 'received_session_bundle': {
        showNotification(`📦 ${msg.sender_name} shared a whiteboard bundle with you!`);
        if (window.confirm(`${msg.sender_name} shared a complete whiteboard session bundle ("${msg.bundle?.title || 'Shared Board'}"). Would you like to download this file?`)) {
          const blob = new Blob([JSON.stringify(msg.bundle, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.download = `${(msg.bundle?.title || 'shared_board').replace(/[^a-zA-Z0-9]/g, '_')}_shared.whiteboard`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        break;
      }

      case 'notice':
        setStatusText(msg.text);
        showNotification(msg.text);
        break;
    }
  };

  // ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore keyboard shortcuts if the user is typing in an input, textarea, or contentEditable element
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (!myPermissions.can_draw && !viewingInstance) {
          showNotification('🔒 Canvas editing is disabled for you by the Host.');
          return;
        }
        handleUndo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z: Redo
      if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        e.preventDefault();
        if (!myPermissions.can_draw && !viewingInstance) {
          showNotification('🔒 Canvas editing is disabled for you by the Host.');
          return;
        }
        handleRedo();
        return;
      }

      // Ctrl+S: Screenshot / Save
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleTakeScreenshot();
        return;
      }

      // Delete or Backspace: delete selected item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!myPermissions.can_draw && !viewingInstance) {
          showNotification('🔒 Canvas editing is disabled for you by the Host.');
          return;
        }
        if (selectedId) {
          e.preventDefault();
          const act = currentDisplayActions.find(a => a.id === selectedId);
          if (act) {
            commitAction({ ...act, undone: true });
            setSelectedId(null);
            showNotification('Item deleted');
          }
          return;
        }
        if (selectedTableId) {
          e.preventDefault();
          const tbl = currentDisplayActions.find(a => a.id === selectedTableId);
          if (tbl) {
            commitAction({ ...tbl, undone: true });
            setSelectedTableId(null);
            showNotification('Table deleted');
          }
          return;
        }
      }

      // Escape: Return to live state if viewing instance, or deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        if (viewingInstance) {
          handleReturnToLiveState();
          return;
        }
        setSelectedId(null);
        setSelectedTableId(null);
        return;
      }

      // Single key tool shortcuts (only without Ctrl/Meta/Alt)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v' || k === 's') {
          setActiveTool('select');
        } else if (k === 'p') {
          setActiveTool('pencil');
        } else if (k === 'b') {
          setActiveTool('brush');
        } else if (k === 'e') {
          setActiveTool('eraser');
        } else if (k === 'h') {
          setActiveTool('pan');
        } else if (k === 't') {
          setActiveTool('text');
        } else if (k === 'n') {
          setActiveTool('sticky');
        } else if (k === 'r') {
          setActiveTool('shape');
        } else if (k === '+' || k === '=') {
          setZoom(z => Math.min(4.0, z * 1.15));
        } else if (k === '-') {
          setZoom(z => Math.max(0.15, z * 0.85));
        } else if (k === '0') {
          handleResetView();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, viewingInstance, selectedId, selectedTableId, currentDisplayActions, redoStack, myPermissions]);

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
  }, [currentDisplayActions, streamingStrokes, zoom, panOffset, gridMode, selectedTableId, selectedId]);

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
      ctx.fillStyle = '#64748b';
      const dotRadius = Math.max(1.8, 2.2 * Math.min(zoom, 1.5));
      for (let x = offsetX; x <= w; x += gridSize) {
        for (let y = offsetY; y <= h; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (gridMode === 'ruled') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let y = offsetY; y <= h; y += gridSize) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [panOffset, zoom, gridMode]);

  // Helper bounding box calculator for selection & manipulation
  function getActionBBox(act) {
    if (!act) return null;
    if (act.kind === 'sticky') {
      return { x: act.x, y: act.y, w: act.w || 160, h: act.h || 120 };
    }
    if (act.kind === 'table') {
      return { x: act.x0, y: act.y0, w: (act.x1 || act.x0 + 100) - act.x0, h: (act.y1 || act.y0 + 100) - act.y0 };
    }
    if (['rect', 'rounded_rect', 'circle', 'triangle', 'diamond', 'star'].includes(act.kind)) {
      return { x: act.x, y: act.y, w: act.w || 50, h: act.h || 50 };
    }
    if (act.kind === 'line' || act.kind === 'arrow') {
      const minX = Math.min(act.x1, act.x2);
      const minY = Math.min(act.y1, act.y2);
      return { x: minX - 4, y: minY - 4, w: Math.max(14, Math.abs(act.x2 - act.x1) + 8), h: Math.max(14, Math.abs(act.y2 - act.y1) + 8) };
    }
    if (act.kind === 'text') {
      const size = act.fontSize || 20;
      const lines = (act.text || '').split('\n');
      let maxLen = 0;
      for (const l of lines) { if (l.length > maxLen) maxLen = l.length; }
      const approxW = Math.max(50, maxLen * size * 0.65);
      const approxH = Math.max(size * 1.25, lines.length * size * 1.3);
      return { x: act.x - 4, y: act.y - size, w: approxW + 8, h: approxH + 8 };
    }
    if (act.kind === 'stroke' && act.points && act.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of act.points) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] > maxY) maxY = pt[1];
      }
      return { x: minX - 6, y: minY - 6, w: Math.max(16, maxX - minX + 12), h: Math.max(16, maxY - minY + 12) };
    }
    return null;
  }

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

    // Render committed actions from current display set (live room or instance sandbox)
    for (const act of currentDisplayActions) {
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

    // Render live vector shape preview while dragging
    if (activeTool === 'shape' && shapeStart && currentPreviewPoint) {
      const sx = shapeStart.x;
      const sy = shapeStart.y;
      const ex = currentPreviewPoint.x;
      const ey = currentPreviewPoint.y;
      const previewAct = {
        id: 'preview_shape',
        kind: activeShape,
        color: strokeColor,
        width: strokeWidth,
        fill: fillShape ? (fillColor || strokeColor) : 'transparent',
        opacity: 0.75,
        x: Math.min(sx, ex),
        y: Math.min(sy, ey),
        w: Math.abs(ex - sx),
        h: Math.abs(ey - sy),
        x1: sx,
        y1: sy,
        x2: ex,
        y2: ey
      };
      renderAction(ctx, previewAct);
    }

    // Render generic selection outline & handles if an item is selected
    if (selectedId) {
      const selAct = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
      if (selAct && selAct.kind !== 'table') {
        const bbox = getActionBBox(selAct);
        if (bbox) {
          ctx.save();
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(bbox.x - 3, bbox.y - 3, bbox.w + 6, bbox.h + 6);

          ctx.setLineDash([]);
          // Top Drag pill
          ctx.fillStyle = '#2563eb';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bbox.x, bbox.y - 26, 64, 20, [4]);
          else ctx.rect(bbox.x, bbox.y - 26, 64, 20);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillText('✥ Drag', bbox.x + 8, bbox.y - 12);

          // Top Delete button
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bbox.x + bbox.w - 20, bbox.y - 26, 20, 20, [4]);
          else ctx.rect(bbox.x + bbox.w - 20, bbox.y - 26, 20, 20);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.fillText('✕', bbox.x + bbox.w - 15, bbox.y - 12);

          // Bottom-Right Resize Handle
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(bbox.x + bbox.w - 6, bbox.y + bbox.h - 6, 12, 12);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bbox.x + bbox.w - 6, bbox.y + bbox.h - 6, 12, 12);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }, [currentDisplayActions, streamingStrokes, currentStroke, currentPreviewPoint, shapeStart, activeShape, activeTool, strokeColor, strokeWidth, fillShape, fillColor, zoom, panOffset, drawInfiniteGrid, selectedTableId, selectedId]);

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

      case 'rounded_rect': {
        const radius = Math.min(16, act.w / 4, act.h / 4);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(act.x, act.y, act.w, act.h, [radius]);
        } else {
          ctx.rect(act.x, act.y, act.w, act.h);
        }
        if (act.fill && act.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

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

      case 'triangle': {
        ctx.beginPath();
        ctx.moveTo(act.x + act.w / 2, act.y);
        ctx.lineTo(act.x + act.w, act.y + act.h);
        ctx.lineTo(act.x, act.y + act.h);
        ctx.closePath();
        if (act.fill && act.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'diamond': {
        ctx.beginPath();
        ctx.moveTo(act.x + act.w / 2, act.y);
        ctx.lineTo(act.x + act.w, act.y + act.h / 2);
        ctx.lineTo(act.x + act.w / 2, act.y + act.h);
        ctx.lineTo(act.x, act.y + act.h / 2);
        ctx.closePath();
        if (act.fill && act.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }

      case 'star': {
        const cx = act.x + act.w / 2;
        const cy = act.y + act.h / 2;
        const outerR = Math.min(Math.abs(act.w), Math.abs(act.h)) / 2;
        const innerR = outerR * 0.42;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (i * Math.PI) / 5 - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
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

      case 'text': {
        const fontStyle = `${act.italic ? 'italic ' : ''}${act.bold ? 'bold ' : ''}${act.fontSize || 20}px ${act.fontFamily || 'Inter, sans-serif'}`;
        ctx.font = fontStyle;
        ctx.fillStyle = act.color || '#000000';
        const lines = (act.text || '').split('\n');
        const lineHeight = (act.fontSize || 20) * 1.25;
        lines.forEach((l, idx) => {
          ctx.fillText(l, act.x, act.y + idx * lineHeight);
        });
        break;
      }

      case 'sticky': {
        const w = act.w || 160;
        const h = act.h || 120;
        
        // Sticky note body
        ctx.fillStyle = act.bgColor || '#fef08a';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x, act.y, w, h, [8]);
        else ctx.rect(act.x, act.y, w, h);
        ctx.fill();
        ctx.stroke();

        // Header bar
        ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
        ctx.fillRect(act.x, act.y, w, 24);
        ctx.fillStyle = '#854d0e';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('📌 NOTE', act.x + 8, act.y + 16);

        // Text inside sticky note
        ctx.fillStyle = '#0f172a';
        ctx.font = '13px Caveat, cursive, sans-serif';
        const lines = (act.text || '').split('\n');
        let lineY = act.y + 42;
        for (const line of lines) {
          if (lineY > act.y + h - 10) break;
          ctx.fillText(line, act.x + 10, lineY, w - 20);
          lineY += 18;
        }

        // Action Pills Above Sticky Note:
        // [ ✥ Drag Note ] (width: 86, height: 20 at act.x, act.y - 26)
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x, act.y - 26, 86, 20, [5]);
        else ctx.rect(act.x, act.y - 26, 86, 20);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('✥ Drag Note', act.x + 8, act.y - 12);

        // [ ✎ Edit ] (width: 48, height: 20 at act.x + 90, act.y - 26)
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x + 90, act.y - 26, 48, 20, [5]);
        else ctx.rect(act.x + 90, act.y - 26, 48, 20);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('✎ Edit', act.x + 95, act.y - 12);

        // [ ✕ Delete ] (width: 20, height: 20 at act.x + 142, act.y - 26)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x + 142, act.y - 26, 20, 20, [5]);
        else ctx.rect(act.x + 142, act.y - 26, 20, 20);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('✕', act.x + 147, act.y - 12);

        // Bottom-right resize handle
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(act.x + w - 7, act.y + h - 7, 14, 14);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(act.x + w - 7, act.y + h - 7, 14, 14);

        if (selectedId === act.id) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(act.x - 3, act.y - 3, w + 6, h + 6);
        }
        break;
      }

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

        // Drag Button and Delete Button ABOVE Table
        ctx.save();
        // Drag Pill
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x0, act.y0 - 26, 96, 20, [5]);
        else ctx.rect(act.x0, act.y0 - 26, 96, 20);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('✥ Drag Table', act.x0 + 8, act.y0 - 12);

        // Delete Button Pill
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(act.x0 + 102, act.y0 - 26, 20, 20, [5]);
        else ctx.rect(act.x0 + 102, act.y0 - 26, 20, 20);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('✕', act.x0 + 107, act.y0 - 12);

        // Bottom-Right Resize Handle
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(act.x1 - 6, act.y1 - 6, 12, 12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(act.x1 - 6, act.y1 - 6, 12, 12);

        if (selectedTableId === act.id) {
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(act.x0 - 2, act.y0 - 2, w + 4, h + 4);
        }
        ctx.restore();
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

    // If in original snapshot view mode, prompt user to switch to sandbox simulation
    if (viewingInstance && sandboxViewMode === 'original') {
      showNotification('Viewing original snapshot. Switch to "Sandbox Simulation" tab to sketch and edit.');
      return;
    }

    // If host blocked drawing, block ALL interactive canvas operations
    if (!myPermissions.can_draw && !viewingInstance) {
      showNotification('🔒 Drawing is disabled for you by the Host.');
      return;
    }

    // ── INTERACTION WITH TABLES ─────────────────────────────────────────
    const tables = currentDisplayActions.filter(a => a.kind === 'table' && !a.undone);
    for (let i = tables.length - 1; i >= 0; i--) {
      const tbl = tables[i];

      // 1. Delete button above table [tbl.x0 + 102, tbl.y0 - 26, 20, 20]
      if (x >= tbl.x0 + 102 && x <= tbl.x0 + 122 && y >= tbl.y0 - 26 && y <= tbl.y0 - 6) {
        if (myPermissions.can_draw) {
          commitAction({ ...tbl, undone: true });
          setSelectedTableId(null);
          showNotification('Table removed');
        }
        return;
      }

      // 2. Drag button above table [tbl.x0, tbl.y0 - 26, 96, 20]
      if (x >= tbl.x0 && x <= tbl.x0 + 96 && y >= tbl.y0 - 26 && y <= tbl.y0 - 6) {
        if (myPermissions.can_draw) {
          setSelectedTableId(tbl.id);
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

      // 3. Resize handle at bottom-right (x1, y1)
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

      // 4. Click inside Table cells (ONLY edits cells, NEVER starts drag)
      const insideTable = x >= tbl.x0 && x <= tbl.x1 && y >= tbl.y0 && y <= tbl.y1;
      if (insideTable) {
        setSelectedTableId(tbl.id);

        if (myPermissions.can_draw) {
          const cellW = (tbl.x1 - tbl.x0) / (tbl.cols || 3);
          const cellH = (tbl.y1 - tbl.y0) / (tbl.rows || 3);
          const r = Math.floor((y - tbl.y0) / cellH);
          const c = Math.floor((x - tbl.x0) / cellW);

          const currentVal = tbl.cells?.[`${r},${c}`] || '';
          const newVal = prompt(`Edit Table Cell (Row ${r + 1}, Col ${c + 1}):`, currentVal);
          if (newVal !== null && newVal !== currentVal) {
            const updatedTable = {
              ...tbl,
              cells: {
                ...(tbl.cells || {}),
                [`${r},${c}`]: newVal
              }
            };
            commitAction(updatedTable);
          }
        }
        setTableDrag(null);
        setIsDrawing(false);
        return;
      }
    }

    // ── INTERACTION WITH STICKY NOTES ───────────────────────────────────
    const stickies = currentDisplayActions.filter(a => a.kind === 'sticky' && !a.undone);
    for (let i = stickies.length - 1; i >= 0; i--) {
      const st = stickies[i];
      const stW = st.w || 160;
      const stH = st.h || 120;

      // 1. Delete button [st.x + 142, st.y - 26, 20, 20]
      if (x >= st.x + 142 && x <= st.x + 162 && y >= st.y - 26 && y <= st.y - 6) {
        if (myPermissions.can_draw) {
          commitAction({ ...st, undone: true });
          setSelectedId(null);
          showNotification('Sticky note removed');
        }
        return;
      }

      // 2. Edit button [st.x + 90, st.y - 26, 48, 20]
      if (x >= st.x + 90 && x <= st.x + 138 && y >= st.y - 26 && y <= st.y - 6) {
        if (myPermissions.can_draw) {
          const newText = prompt('Edit Note Text:', st.text || '');
          if (newText !== null && newText !== st.text) {
            commitAction({ ...st, text: newText });
          }
        }
        return;
      }

      // 3. Drag button [st.x, st.y - 26, 86, 20]
      if (x >= st.x && x <= st.x + 86 && y >= st.y - 26 && y <= st.y - 6) {
        if (myPermissions.can_draw) {
          setSelectedId(st.id);
          setStickyDrag({
            id: st.id,
            startX: x,
            startY: y,
            origX: st.x,
            origY: st.y
          });
        }
        return;
      }

      // 4. Resize handle at bottom-right (st.x + stW, st.y + stH)
      const nearResize = Math.hypot(x - (st.x + stW), y - (st.y + stH)) < 18 / zoom;
      if (nearResize && myPermissions.can_draw) {
        setSelectedId(st.id);
        setStickyResize({
          id: st.id,
          startX: x,
          startY: y,
          origW: stW,
          origH: stH
        });
        return;
      }

      // 5. Inside Note Body (Click to select & double-click to edit)
      if (x >= st.x && x <= st.x + stW && y >= st.y && y <= st.y + stH) {
        setSelectedId(st.id);
        if (e.detail === 2 && myPermissions.can_draw) {
          const newText = prompt('Edit Note Text:', st.text || '');
          if (newText !== null && newText !== st.text) {
            commitAction({ ...st, text: newText });
          }
        }
        setStickyDrag(null);
        setIsDrawing(false);
        return;
      }
    }

    // ── GENERIC SELECTION TOOL INTERACTION ───────────────────────────────
    if (activeTool === 'select') {
      if (selectedId) {
        const selAct = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
        if (selAct) {
          const bbox = getActionBBox(selAct);
          if (bbox) {
            // Delete handle
            if (x >= bbox.x + bbox.w - 20 && x <= bbox.x + bbox.w && y >= bbox.y - 26 && y <= bbox.y - 6) {
              commitAction({ ...selAct, undone: true });
              setSelectedId(null);
              showNotification('Item deleted');
              return;
            }

            // Drag handle pill
            if (x >= bbox.x && x <= bbox.x + 64 && y >= bbox.y - 26 && y <= bbox.y - 6) {
              setSelectedDrag({
                id: selAct.id,
                startX: x,
                startY: y,
                act: JSON.parse(JSON.stringify(selAct))
              });
              return;
            }

            // Resize handle
            if (Math.hypot(x - (bbox.x + bbox.w), y - (bbox.y + bbox.h)) < 18 / zoom) {
              setSelectedResize({
                id: selAct.id,
                startX: x,
                startY: y,
                act: JSON.parse(JSON.stringify(selAct)),
                origW: bbox.w,
                origH: bbox.h
              });
              return;
            }
          }
        }
      }

      // Hit-test all actions top-down
      let hitId = null;
      for (let i = currentDisplayActions.length - 1; i >= 0; i--) {
        const act = currentDisplayActions[i];
        if (act.undone) continue;
        const bbox = getActionBBox(act);
        if (bbox && x >= bbox.x && x <= bbox.x + bbox.w && y >= bbox.y && y <= bbox.y + bbox.h) {
          hitId = act.id;
          break;
        }
      }

      setSelectedId(hitId);
      if (hitId) {
        const hitAct = currentDisplayActions.find(a => a.id === hitId);
        // Double click on text to edit
        if (hitAct && hitAct.kind === 'text' && e.detail === 2) {
          if (myPermissions.can_draw || viewingInstance) {
            const newText = prompt('Edit Text:', hitAct.text || '');
            if (newText !== null && newText !== hitAct.text) {
              commitAction({ ...hitAct, text: newText });
            }
          }
          return;
        }

        setSelectedDrag({
          id: hitId,
          startX: x,
          startY: y,
          act: JSON.parse(JSON.stringify(hitAct))
        });
      }
      return;
    }

    // Unselect if clicked elsewhere
    if (selectedTableId) setSelectedTableId(null);
    if (selectedId) setSelectedId(null);

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

      if (!viewingInstance && ws && ws.readyState === WebSocket.OPEN) {
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
          fontSize: activeFontSize || 24,
          fontFamily: activeFontFamily || 'Inter, sans-serif',
          bold: activeFontBold,
          italic: activeFontItalic
        };
        commitAction(textAction);
        setSelectedId(textAction.id);
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
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cursor', x, y }));
    }

    // Handle Table Resizing
    if (tableResize) {
      const dx = x - tableResize.startX;
      const dy = y - tableResize.startY;
      const minW = tableResize.cols * 40;
      const minH = tableResize.rows * 25;

      const updateFn = (list) => list.map(a => {
        if (a.id === tableResize.id) {
          return {
            ...a,
            x1: Math.max(a.x0 + minW, tableResize.origX1 + dx),
            y1: Math.max(a.y0 + minH, tableResize.origY1 + dy)
          };
        }
        return a;
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    // Handle Table Dragging
    if (tableDrag) {
      const dx = x - tableDrag.startX;
      const dy = y - tableDrag.startY;

      const updateFn = (list) => list.map(a => {
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
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    // Handle Sticky Note Dragging
    if (stickyDrag) {
      const dx = x - stickyDrag.startX;
      const dy = y - stickyDrag.startY;

      const updateFn = (list) => list.map(a => {
        if (a.id === stickyDrag.id) {
          return { ...a, x: stickyDrag.origX + dx, y: stickyDrag.origY + dy };
        }
        return a;
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    // Handle Sticky Note Resizing
    if (stickyResize) {
      const dx = x - stickyResize.startX;
      const dy = y - stickyResize.startY;
      const newW = Math.max(120, stickyResize.origW + dx);
      const newH = Math.max(90, stickyResize.origH + dy);

      const updateFn = (list) => list.map(a => {
        if (a.id === stickyResize.id) {
          return { ...a, w: newW, h: newH };
        }
        return a;
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    // Handle Generic Selected Dragging
    if (selectedDrag) {
      const dx = x - selectedDrag.startX;
      const dy = y - selectedDrag.startY;
      const orig = selectedDrag.act;

      const updateFn = (list) => list.map(a => {
        if (a.id === selectedDrag.id) {
          if (orig.kind === 'table') {
            return { ...a, x0: orig.x0 + dx, y0: orig.y0 + dy, x1: orig.x1 + dx, y1: orig.y1 + dy };
          }
          if (['sticky', 'rect', 'rounded_rect', 'circle', 'triangle', 'diamond', 'star'].includes(orig.kind)) {
            return { ...a, x: orig.x + dx, y: orig.y + dy };
          }
          if (orig.kind === 'line' || orig.kind === 'arrow') {
            return { ...a, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy };
          }
          if (orig.kind === 'text') {
            return { ...a, x: orig.x + dx, y: orig.y + dy };
          }
          if (orig.kind === 'stroke') {
            return { ...a, points: orig.points.map(([px, py]) => [px + dx, py + dy]) };
          }
        }
        return a;
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    // Handle Generic Selected Resizing
    if (selectedResize) {
      const dx = x - selectedResize.startX;
      const dy = y - selectedResize.startY;
      const orig = selectedResize.act;
      const newW = Math.max(20, (selectedResize.origW || 50) + dx);
      const newH = Math.max(20, (selectedResize.origH || 50) + dy);

      const updateFn = (list) => list.map(a => {
        if (a.id === selectedResize.id) {
          if (['sticky', 'rect', 'rounded_rect', 'circle', 'triangle', 'diamond', 'star'].includes(orig.kind)) {
            return { ...a, w: newW, h: newH };
          }
          if (orig.kind === 'table') {
            return { ...a, x1: orig.x0 + newW, y1: orig.y0 + newH };
          }
          if (orig.kind === 'line' || orig.kind === 'arrow') {
            return { ...a, x2: orig.x1 + newW, y2: orig.y1 + newH };
          }
          if (orig.kind === 'text') {
            const scale = Math.max(0.4, Math.max(newW / (selectedResize.origW || 40), newH / (selectedResize.origH || 24)));
            const newFontSize = Math.round(Math.max(12, Math.min(140, (orig.fontSize || 20) * scale)));
            return { ...a, fontSize: newFontSize };
          }
        }
        return a;
      });

      if (viewingInstance) {
        setViewingInstance(prev => ({ ...prev, actions: updateFn(prev.actions) }));
      } else {
        setActions(prev => updateFn(prev));
      }
      return;
    }

    if (!isDrawing) return;

    if (activeTool === 'shape' && shapeStart) {
      setCurrentPreviewPoint({ x, y });
    }

    if (currentStroke) {
      const updatedPts = [...currentStroke.points, [x, y]];
      setCurrentStroke(prev => ({ ...prev, points: updatedPts }));

      if (!viewingInstance && ws && ws.readyState === WebSocket.OPEN) {
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
      const modified = currentDisplayActions.find(a => a.id === tableResize.id);
      if (modified) commitAction(modified);
      setTableResize(null);
      return;
    }

    if (tableDrag) {
      const modified = currentDisplayActions.find(a => a.id === tableDrag.id);
      if (modified) commitAction(modified);
      setTableDrag(null);
      return;
    }

    if (stickyDrag) {
      const modified = currentDisplayActions.find(a => a.id === stickyDrag.id);
      if (modified) commitAction(modified);
      setStickyDrag(null);
      return;
    }

    if (stickyResize) {
      const modified = currentDisplayActions.find(a => a.id === stickyResize.id);
      if (modified) commitAction(modified);
      setStickyResize(null);
      return;
    }

    if (selectedDrag) {
      const modified = currentDisplayActions.find(a => a.id === selectedDrag.id);
      if (modified) commitAction(modified);
      setSelectedDrag(null);
      return;
    }

    if (selectedResize) {
      const modified = currentDisplayActions.find(a => a.id === selectedResize.id);
      if (modified) commitAction(modified);
      setSelectedResize(null);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStroke && currentStroke.points.length > 0) {
      commitAction(currentStroke);
      setCurrentStroke(null);
    } else if (activeTool === 'shape' && shapeStart) {
      const { x, y } = getCanvasCoords(e);
      const w = Math.abs(x - shapeStart.x);
      const h = Math.abs(y - shapeStart.y);
      const shapeId = `shape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      let shapeAction = null;
      if (['rect', 'rounded_rect', 'circle', 'triangle', 'diamond', 'star'].includes(activeShape)) {
        if (w > 3 || h > 3) {
          shapeAction = {
            id: shapeId,
            kind: activeShape,
            x: Math.min(shapeStart.x, x),
            y: Math.min(shapeStart.y, y),
            w,
            h,
            color: strokeColor,
            width: strokeWidth,
            fill: fillShape ? (fillColor || strokeColor) : 'transparent'
          };
        }
      } else if (activeShape === 'line' || activeShape === 'arrow') {
        if (Math.hypot(x - shapeStart.x, y - shapeStart.y) > 3) {
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
      }

      if (shapeAction) {
        commitAction(shapeAction);
      }
      setShapeStart(null);
      setCurrentPreviewPoint(null);
    }
  };

  // ── MOUSE WHEEL: POINTER-CENTERED ZOOM IN & OUT ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onCanvasWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Mouse wheel directly zooms centered on pointer position
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const newZoom = Math.max(0.15, Math.min(4.0, zoom * zoomFactor));

      if (Math.abs(newZoom - zoom) < 0.001) return;

      const worldX = (mouseX - panOffset.x) / zoom;
      const worldY = (mouseY - panOffset.y) / zoom;

      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    };

    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onCanvasWheel);
    };
  }, [zoom, panOffset]);

  // ── ACTION DISPATCHER & COMMIT ──────────────────────────────────────
  const commitAction = (action) => {
    if (viewingInstance) {
      // Sandboxed in instance mode - does NOT affect the live room
      setViewingInstance(prev => {
        const filtered = (prev.actions || []).filter(a => a.id !== action.id);
        return { ...prev, actions: [...filtered, action] };
      });
      return;
    }

    setActions(prev => {
      const filtered = prev.filter(a => a.id !== action.id);
      return [...filtered, action];
    });
    setRedoStack([]);

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
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
    if (viewingInstance) {
      const active = (viewingInstance.actions || []).filter(a => !a.undone);
      if (active.length === 0) return;
      const last = active[active.length - 1];
      setViewingInstance(prev => ({
        ...prev,
        actions: prev.actions.map(a => a.id === last.id ? { ...a, undone: true } : a)
      }));
      return;
    }

    const activeActions = actions.filter(a => !a.undone);
    if (activeActions.length === 0) return;
    const last = activeActions[activeActions.length - 1];

    setActions(prev => prev.map(a => a.id === last.id ? { ...a, undone: true } : a));
    setRedoStack(prev => [...prev, last.id]);

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'undo', target: last.id }));
    }
  };

  const handleRedo = () => {
    if (viewingInstance) {
      const undone = (viewingInstance.actions || []).filter(a => a.undone);
      if (undone.length === 0) return;
      const last = undone[undone.length - 1];
      setViewingInstance(prev => ({
        ...prev,
        actions: prev.actions.map(a => a.id === last.id ? { ...a, undone: false } : a)
      }));
      return;
    }

    if (redoStack.length === 0) return;
    const redoId = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    setActions(prev => prev.map(a => a.id === redoId ? { ...a, undone: false } : a));

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'redo', target: redoId }));
    }
  };

  const handleClearCanvas = () => {
    if (viewingInstance) {
      if (window.confirm('Clear all drawings in this sandbox instance?')) {
        setViewingInstance(prev => ({ ...prev, actions: [] }));
      }
      return;
    }

    if (!isHost && !isCohost) {
      showNotification('⚠️ Only the host or co-host can clear the canvas for all participants.');
      return;
    }
    if (window.confirm('Clear all drawings and items on the whiteboard?')) {
      setActions([]);
      if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'clear_canvas' }));
      }
    }
  };

  // ── INK-TO-FONT HANDWRITING ENGINE ─────────────────────────────────
  const handleInkToFont = () => {
    const strokeActions = currentDisplayActions.filter(a => a.kind === 'stroke' && !a.undone);
    if (strokeActions.length === 0) {
      showNotification('✏️ Draw some letters, cursive words, numbers, or symbols with the pen first!');
      return;
    }

    const { text, bbox } = recognizeInkStrokes(strokeActions);
    if (!text) {
      showNotification('⚠️ Could not recognize text from the current ink strokes.');
      return;
    }

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
      if (!viewingInstance && !isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'undo', target: s.id }));
      }
    });

    commitAction(textAction);
    showNotification(`✨ Converted handwriting to: "${text}"`);
  };

  // ── HOST CONTROLS & MATRIX PERMISSIONS ────────────────────────────
  const handleUpdateRoomPermissions = (perms) => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'update_matrix_permissions',
        permissions: perms
      }));
    }
    setRoomData(prev => ({ ...prev, ...perms }));
    showNotification('Updated host permission matrix');
  };

  const handleUpdateMemberCustomPermissions = (targetUserCode, perms) => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'update_member_permission',
        target_user_code: targetUserCode,
        permissions: perms
      }));
    }
  };

  const handleBlockAll = () => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'block_all'
      }));
    }
  };

  const handleAllowAll = () => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'allow_all'
      }));
    }
  };

  const handleToggleDraw = (targetUserCode, canDraw) => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'host_control',
        action: 'toggle_draw',
        target_user_code: targetUserCode,
        can_draw: canDraw
      }));
    }
  };

  const handlePromoteCohost = (targetUserCode, isCohostVal) => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
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
      if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'host_control',
          action: 'kick',
          target_user_code: targetUserCode
        }));
      }
    }
  };

  const handleAddMember = (target) => {
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
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

  const handleCycleGrid = () => {
    if (!myPermissions.can_draw && !isHost) {
      showNotification('🔒 Canvas grid changes are restricted by the Host.');
      return;
    }
    const modes = ['square', 'dot', 'ruled', 'none'];
    const labels = {
      square: '🔲 Square Graph Grid',
      dot: '⚪ Dot Matrix Grid',
      ruled: '📜 Ruled Notebook Lines',
      none: '⬜ Plain (No Grid)'
    };
    const nextIdx = (modes.indexOf(gridMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setGridMode(nextMode);
    showNotification(`Canvas Grid: ${labels[nextMode]}`);

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_grid_style',
        grid_style: nextMode
      }));
    }
  };

  // ── SCREENSHOT / EXPORT / PUBLIC WORKS ─────────────────────────────
  const captureScreenshotDataUrl = () => {
    const bgCanvas = bgCanvasRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const oCtx = offscreen.getContext('2d');

    // 1. Solid crisp white background
    oCtx.fillStyle = '#ffffff';
    oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    // 2. Composite background grid if present
    if (bgCanvas && gridMode !== 'none') {
      oCtx.drawImage(bgCanvas, 0, 0);
    }

    // 3. Composite all drawings, shapes, tables, notes
    oCtx.drawImage(canvas, 0, 0);

    return offscreen.toDataURL('image/png');
  };

  const handleTakeScreenshot = () => {
    const defaultName = `${(roomData?.title || room.title || 'Canvas').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setSaveModalConfig({
      mode: 'screenshot',
      defaultTitle: defaultName
    });
  };

  const handleOpenSaveInstanceModal = () => {
    const defaultName = `Milestone - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setSaveModalConfig({
      mode: 'instance',
      defaultTitle: defaultName
    });
  };

  const handleConfirmSaveDestination = ({ destination, title }) => {
    const isPublic = destination === 'public';

    if (saveModalConfig?.mode === 'screenshot') {
      const dataUrl = captureScreenshotDataUrl();
      if (!dataUrl) return;

      if (isPublic) {
        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'save_public_work',
            title,
            image_data: dataUrl,
            is_public: 1
          }));
          showNotification(`🌐 Published screenshot "${title}" to Public Works!`);
        } else {
          // Offline / Local Public Works
          const offWork = {
            id: `pw_off_${Date.now()}`,
            title,
            image_data: dataUrl,
            is_public: true,
            author_code: user?.user_code || 'local',
            author_name: user?.name || 'Local User',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setPublicWorks(prev => {
            const next = [offWork, ...prev];
            try { localStorage.setItem(`offline_public_works_${room?.code || 'local'}`, JSON.stringify(next)); } catch(e){}
            return next;
          });
          showNotification(`🌐 Screenshot "${title}" saved to Public Works!`);
        }
      } else {
        // Save to My Own System (Private)
        const privWork = {
          id: `pw_priv_${Date.now()}`,
          title,
          image_data: dataUrl,
          is_public: false,
          author_code: user?.user_code || 'local',
          author_name: user?.name || 'Local User',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setPrivateScreenshots(prev => {
          const next = [privWork, ...prev];
          try { localStorage.setItem('my_private_screenshots', JSON.stringify(next)); } catch(e){}
          return next;
        });

        // Trigger local file download
        const a = document.createElement('a');
        a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
        a.href = dataUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showNotification(`💾 Screenshot saved to your own system files!`);
      }
    } else if (saveModalConfig?.mode === 'instance') {
      const unUndoneActions = currentDisplayActions.filter(a => !a.undone);

      if (isPublic) {
        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'save_milestone',
            title,
            snapshot: unUndoneActions,
            is_public: 1
          }));
          showNotification(`🌐 Published instance "${title}" to room Public Works!`);
        } else {
          // Offline / Local Public Instance
          const offMs = {
            id: `ms_off_${Date.now()}`,
            title,
            is_public: true,
            author_code: user?.user_code || 'local',
            author_name: user?.name || 'Local User',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            snapshot: unUndoneActions,
            original_snapshot: unUndoneActions,
            host_sandbox: unUndoneActions
          };
          setMilestones(prev => {
            const next = [offMs, ...prev];
            try { localStorage.setItem(`offline_milestones_${room?.code || 'local'}`, JSON.stringify(next)); } catch(e){}
            return next;
          });
          showNotification(`📌 Saved instance "${title}" to Public Works!`);
        }
      } else {
        // Save to My Own System (Private Instance)
        const privMs = {
          id: `ms_priv_${Date.now()}`,
          title,
          is_public: false,
          author_code: user?.user_code || 'local',
          author_name: user?.name || 'Local User',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          snapshot: unUndoneActions,
          original_snapshot: unUndoneActions,
          host_sandbox: unUndoneActions
        };
        setPrivateMilestones(prev => {
          const next = [privMs, ...prev];
          try { localStorage.setItem('my_private_instances', JSON.stringify(next)); } catch(e){}
          return next;
        });
        showNotification(`💾 Instance "${title}" saved to your own local system!`);
      }
    }

    setSaveModalConfig(null);
  };

  const handlePublishMilestone = (optionsOrTitle) => {
    if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
      handleConfirmSaveDestination({
        destination: optionsOrTitle.destination || 'public',
        title: optionsOrTitle.title || `Instance - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      });
      return;
    }
    const defaultTitle = typeof optionsOrTitle === 'string' && optionsOrTitle.trim()
      ? optionsOrTitle.trim()
      : `Instance - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setSaveModalConfig({
      mode: 'instance',
      defaultTitle
    });
  };

  const handlePublishPublicWork = (optionsOrTitle) => {
    if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
      handleConfirmSaveDestination({
        destination: optionsOrTitle.destination || 'public',
        title: optionsOrTitle.title || `Screenshot - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      });
      return;
    }
    const defaultTitle = typeof optionsOrTitle === 'string' && optionsOrTitle.trim()
      ? optionsOrTitle.trim()
      : `Screenshot - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setSaveModalConfig({
      mode: 'screenshot',
      defaultTitle
    });
  };

  const handleUpdateTextProperty = (property, value) => {
    if (property === 'fontFamily') setActiveFontFamily(value);
    if (property === 'fontSize') setActiveFontSize(value);
    if (property === 'bold') setActiveFontBold(value);
    if (property === 'italic') setActiveFontItalic(value);
    if (property === 'color') setStrokeColor(value);

    if (selectedId) {
      const act = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
      if (act && act.kind === 'text') {
        const updated = {
          ...act,
          [property]: value
        };
        commitAction(updated);
      }
    }
  };

  const handleEditTextContent = () => {
    if (!selectedId) return;
    const act = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
    if (act && act.kind === 'text') {
      const newText = prompt('Edit Text Content:', act.text || '');
      if (newText !== null && newText !== act.text) {
        commitAction({ ...act, text: newText });
      }
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const act = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
    if (act) {
      commitAction({ ...act, undone: true });
      setSelectedId(null);
    }
  };

  const handleDeletePublicWork = (workId, isPublic = true) => {
    if (isPublic) {
      if (!isHost) {
        showNotification('🔒 Only the host can delete public screenshots.');
        return;
      }
      if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'delete_public_work',
          id: workId
        }));
      }
      setPublicWorks(prev => {
        const next = prev.filter(p => p.id !== workId);
        try { localStorage.setItem(`offline_public_works_${room?.code || 'local'}`, JSON.stringify(next)); } catch(e){}
        return next;
      });
      showNotification('Screenshot removed from Public Works');
    } else {
      setPrivateScreenshots(prev => {
        const next = prev.filter(p => p.id !== workId);
        try { localStorage.setItem('my_private_screenshots', JSON.stringify(next)); } catch(e){}
        return next;
      });
      showNotification('Private screenshot deleted');
    }
  };

  const handleDeleteMilestone = (milestoneId, isPublic = true) => {
    if (isPublic) {
      if (!isHost) {
        showNotification('🔒 Only the host can delete public instances.');
        return;
      }
      if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'delete_milestone',
          id: milestoneId
        }));
      }
      setMilestones(prev => {
        const next = prev.filter(m => m.id !== milestoneId);
        try { localStorage.setItem(`offline_milestones_${room?.code || 'local'}`, JSON.stringify(next)); } catch(e){}
        return next;
      });
      showNotification('Instance removed from Public Works');
    } else {
      setPrivateMilestones(prev => {
        const next = prev.filter(m => m.id !== milestoneId);
        try { localStorage.setItem('my_private_instances', JSON.stringify(next)); } catch(e){}
        return next;
      });
      showNotification('Private instance deleted');
    }
  };

  const handleSaveInstanceEdits = () => {
    if (!viewingInstance) return;
    const unUndone = (viewingInstance.actions || []).filter(a => !a.undone);

    if (isHost) {
      // Host saves to server milestone host sandbox (viewable by everyone)
      if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update_instance_snapshot',
          instance_id: viewingInstance.id,
          snapshot: unUndone
        }));
      }
      setMilestones(prev => prev.map(m => m.id === viewingInstance.id ? { ...m, snapshot: unUndone, host_sandbox: unUndone } : m));
      showNotification(`💾 Host sandbox updated for instance "${viewingInstance.title}" (viewable by all)`);
    } else {
      // Non-host saves locally to their personal account only
      try {
        localStorage.setItem(`sandbox_${viewingInstance.id}_${user?.user_code || 'me'}`, JSON.stringify(unUndone));
      } catch(e){}
      showNotification(`💾 Sandbox edits saved to your personal account only`);
    }
  };

  const handleRestoreMilestone = (snapshot, title) => {
    if (!isHost) {
      showNotification('🔒 Restricted: Only the host has permission to restore canvas instances to the live whiteboard.');
      return;
    }
    setViewingInstance(null);
    setActions(snapshot || []);
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'restore_milestone', actions: snapshot, title }));
    }
    showNotification(`🔄 Canvas restored to milestone "${title}"`);
  };

  const handleReturnToLiveState = () => {
    setViewingInstance(null);
    setSandboxViewMode('sandbox');
    showNotification('🚀 Returned to live whiteboard session');
  };

  const handleBroadcastShowInstance = (ms) => {
    if (!isHost) {
      showNotification('🔒 Only the host can broadcast an instance to all members.');
      return;
    }
    const snapToBroadcast = (sandboxViewMode === 'original' ? (ms.original_snapshot || ms.snapshot) : (ms.host_sandbox || ms.snapshot || ms.actions)) || [];
    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'broadcast_instance_show',
        instance_id: ms.id,
        title: ms.title,
        snapshot: snapToBroadcast
      }));
    }
    showNotification(`📡 Broadcasted sandbox instance "${ms.title}" to everyone on live canvas!`);
  };

  const handleShareWithMember = (targetUserCode) => {
    const unUndoneActions = actions.filter(a => !a.undone);
    const bundle = {
      version: '2.0.0',
      title: roomData?.title || room.title || 'Whiteboard Session',
      room_code: room.code,
      exported_at: new Date().toISOString(),
      action_count: unUndoneActions.length,
      actions: unUndoneActions,
      milestones: milestones
    };

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'share_session_bundle',
        target_user_code: targetUserCode,
        bundle
      }));
      showNotification(`📤 Whiteboard bundle sent to member!`);
    }
  };

  // ── IMPORT WHITEBOARD BUNDLE FILE DIRECTLY ─────────────────────────
  const handleImportIntoWhiteboard = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const importedActions = data.actions || (Array.isArray(data) ? data : []);
        const importedMilestones = data.milestones || [];

        if (viewingInstance) {
          setViewingInstance(prev => ({
            ...prev,
            actions: [...(prev.actions || []), ...importedActions]
          }));
          showNotification(`📥 Imported ${importedActions.length} elements into current instance`);
        } else if (isOffline) {
          setActions(importedActions);
          if (importedMilestones.length > 0) {
            setMilestones(importedMilestones);
          }
          showNotification(`📥 Imported ${importedActions.length} elements into Personal Space`);
        } else {
          if (!myPermissions.can_draw) {
            showNotification('⚠️ You do not have drawing permission to import elements into this session.');
            return;
          }
          importedActions.forEach(act => commitAction(act));
          showNotification(`📥 Imported ${importedActions.length} elements into room`);
        }
      } catch (err) {
        showNotification('⚠️ Failed to read whiteboard file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-100 font-sans">
      {/* Hidden file input for importing whiteboard bundle */}
      <input
        type="file"
        ref={whiteboardFileInputRef}
        onChange={handleImportIntoWhiteboard}
        accept=".whiteboard,.json"
        className="hidden"
      />

      {/* ── TIER 1: FIXED TOP GLOBAL NAVIGATION HEADER BAR ── */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-30 px-3 sm:px-4 flex items-center justify-between shadow-xs">
        {/* Left: Back to Hub & Room Title & Code Badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onBackToHub}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Hub</span>
          </button>

          <img src="/logo.png" className="w-7 h-7 rounded-lg object-contain shadow-2xs border border-slate-200 bg-white p-0.5 shrink-0" alt="Logo" />

          <div
            onClick={copyRoomCode}
            title={isOffline ? "Personal offline workspace" : "Click to copy Room Code"}
            className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer transition min-w-0"
          >
            <span className="text-xs font-bold text-slate-800 truncate max-w-[120px] sm:max-w-xs md:max-w-sm">
              {roomData?.title || room.title}
            </span>
            {isOffline ? (
              <span className="px-2 py-0.5 rounded-lg bg-teal-100 text-teal-800 text-[10px] font-bold uppercase tracking-wider shrink-0">
                Personal Offline
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 font-mono font-bold text-xs shrink-0 flex items-center gap-1">
                {room.code}
                {copiedCode && <Check className="w-3 h-3 text-green-600" />}
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions (Import, Public Works, Export, Add Member, Instances, Participants, Chat) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Import Whiteboard Button */}
          <button
            onClick={() => whiteboardFileInputRef.current?.click()}
            title="Import Whiteboard Package (.whiteboard or .json)"
            className="px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden lg:inline">Import</span>
          </button>

          {/* Public Works Gallery Trigger */}
          <button
            onClick={() => setIsPublicWorksOpen(true)}
            title="Public Works Screenshot Gallery"
            className="px-2.5 sm:px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-2xs"
          >
            <ImageIcon className="w-3.5 h-3.5 text-violet-600" />
            <span className="hidden md:inline">Public Works</span>
            {publicWorks.length > 0 && (
              <span className="px-1.5 py-0.2 bg-violet-200 text-violet-800 text-[10px] rounded-full font-bold">
                {publicWorks.length}
              </span>
            )}
          </button>

          {/* Screenshot & Share Bundle Modal Trigger */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            title="Take Screenshot, Export Bundle, or Share with Member"
            className="px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-2xs"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Export & Share</span>
          </button>

          {/* Add Member button (Host & Co-host) */}
          {!isOffline && (isHost || isCohost) && (
            <button
              onClick={() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'list_connected_users' }));
                }
                setIsAddMemberOpen(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 text-xs font-bold"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Member</span>
            </button>
          )}

          {/* Milestones / Instances */}
          <button
            onClick={() => setIsMilestonesOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition flex items-center gap-1 text-xs font-bold"
            title="Whiteboard Instances & History"
          >
            <History className="w-4 h-4 text-violet-600" />
            <span className="hidden lg:inline text-slate-600">Instances</span>
          </button>

          {!isOffline && (
            <>
              {/* Participants drawer toggle */}
              <button
                onClick={() => {
                  setIsParticipantsOpen(!isParticipantsOpen);
                  setIsChatOpen(false);
                }}
                className={`px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold ${
                  isParticipantsOpen ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                }`}
                title="Participants & Host Controls"
              >
                <Users className="w-4 h-4 text-blue-600" />
                <span className="hidden sm:inline">{members.length}</span>
              </button>

              {/* Chat drawer toggle */}
              <button
                onClick={() => {
                  setIsChatOpen(!isChatOpen);
                  setIsParticipantsOpen(false);
                }}
                className={`px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition flex items-center gap-1.5 text-xs font-bold ${
                  isChatOpen ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''
                }`}
                title="Session Chat"
              >
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline">Chat</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── INSTANCE SANDBOX MODE TOP FLOATING BANNER ── */}
      {viewingInstance && (
        <div className="fixed top-14 left-0 right-0 z-25 bg-amber-500 text-white px-3 sm:px-4 py-2 shadow-md flex flex-wrap items-center justify-between gap-2 text-xs font-bold animate-slide-down">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-amber-100 shrink-0 animate-pulse" />
            <span className="truncate">
              Sandboxed: <span className="underline">{viewingInstance.title}</span> &bull; Edits isolated
            </span>

            {/* View Switcher: Original Snapshot vs Sandbox Simulation vs Host Sandbox */}
            <div className="flex items-center gap-1 bg-amber-600/70 p-0.5 rounded-lg ml-1 sm:ml-2">
              <button
                onClick={() => setSandboxViewMode('original')}
                title="View original snapshot state before sandbox modifications"
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                  sandboxViewMode === 'original'
                    ? 'bg-white text-amber-900 shadow-2xs'
                    : 'text-amber-100 hover:text-white'
                }`}
              >
                <span>📁 Original</span>
              </button>
              <button
                onClick={() => setSandboxViewMode('sandbox')}
                title="Work in your active sandbox simulation"
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                  sandboxViewMode === 'sandbox'
                    ? 'bg-white text-amber-900 shadow-2xs'
                    : 'text-amber-100 hover:text-white'
                }`}
              >
                <span>🧪 Sandbox</span>
              </button>
              {viewingInstance.host_sandbox && !isHost && (
                <button
                  onClick={() => setSandboxViewMode('host_sandbox')}
                  title="View the host's published sandbox simulation"
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                    sandboxViewMode === 'host_sandbox'
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-amber-100 hover:text-white'
                  }`}
                >
                  <span>👑 Host Sandbox</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Host Control: Show on Live Canva */}
            {isHost && (
              <button
                onClick={() => handleBroadcastShowInstance(viewingInstance)}
                title="Host Action: Broadcast this sandbox view to all members live on their canvas"
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-1 text-xs font-bold border border-amber-400"
              >
                <Radio className="w-3.5 h-3.5 text-white" />
                <span className="hidden md:inline">Show on Live Canva</span>
              </button>
            )}

            {/* Host Control: Restore to Live Canva */}
            {isHost && (
              <button
                onClick={() => {
                  const snap = sandboxViewMode === 'original'
                    ? (viewingInstance.original_snapshot || viewingInstance.actions)
                    : (viewingInstance.actions || viewingInstance.snapshot);
                  if (window.confirm(`Restore live canvas to "${viewingInstance.title}" (${sandboxViewMode})?`)) {
                    handleRestoreMilestone(snap, viewingInstance.title);
                  }
                }}
                title="Host Action: Restore this instance state to live whiteboard"
                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition flex items-center gap-1 text-xs font-bold shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Restore to Live</span>
              </button>
            )}

            {/* Save in Instance (Host saves to server, member saves to local account) */}
            <button
              onClick={handleSaveInstanceEdits}
              title={isHost ? "Save sandbox edits to server milestone (viewable by everyone)" : "Save sandbox edits to your local personal account only"}
              className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 rounded-lg shadow-sm transition flex items-center gap-1 text-xs font-bold"
            >
              <Save className="w-3.5 h-3.5 text-amber-700" />
              <span>Save</span>
            </button>

            {/* Return to Live State */}
            <button
              onClick={handleReturnToLiveState}
              title="Return to the live collaborative whiteboard session"
              className="px-3 py-1 bg-amber-950 hover:bg-black text-white rounded-lg shadow-sm transition flex items-center gap-1 text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Return to Live</span>
            </button>
          </div>
        </div>
      )}

      {/* Blocked View-Only Banner (Full-Width Top Banner) */}
      {!myPermissions.can_draw && !viewingInstance && (
        <div className="fixed top-14 left-0 right-0 z-25 bg-red-600/95 text-white px-4 py-1.5 shadow-md flex items-center justify-center text-xs font-bold gap-2 animate-slide-down">
          <Lock className="w-3.5 h-3.5 text-red-200" />
          <span>You are in View-Only mode. Drawing is paused by the Host.</span>
        </div>
      )}

      {/* Floating Center Notification Toast */}
      {roomNotification && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-slate-900/90 backdrop-blur-md text-white rounded-full shadow-2xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-fade-in pointer-events-none">
          <span>{roomNotification}</span>
        </div>
      )}

      {/* ── TIER 2: FLOATING PRIMARY TOOLBAR ── */}
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        activeShape={activeShape}
        setActiveShape={setActiveShape}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        fillShape={fillShape}
        setFillShape={setFillShape}
        fillColor={fillColor}
        setFillColor={setFillColor}
        gridMode={gridMode}
        setGridMode={setGridMode}
        onCycleGrid={handleCycleGrid}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearCanvas={handleClearCanvas}
        onInkToFont={handleInkToFont}
        onOpenTableModal={() => setIsTableModalOpen(true)}
        onOpenShapesModal={() => setIsShapesModalOpen(true)}
        onResetView={handleResetView}
        canUndo={currentDisplayActions.some(a => !a.undone)}
        canRedo={redoStack.length > 0}
        zoom={zoom}
        setZoom={setZoom}
        canDraw={myPermissions.can_draw}
        hasTopBanner={hasTopBanner}
      />

      {/* ── FLOATING TEXT & TYPOGRAPHY TOOLBAR (When Text Tool is active or a text item is selected) ── */}
      {((selectedAction && selectedAction.kind === 'text') || activeTool === 'text') && (
        <div
          className={`fixed ${
            hasTopBanner ? 'top-[166px] sm:top-[174px]' : 'top-[122px] sm:top-[130px]'
          } left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 max-w-[95vw] overflow-x-auto text-xs animate-fade-in`}
        >
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 text-slate-700 font-bold shrink-0">
            <Type className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Text & Font</span>
          </div>

          {/* Font Family Selector */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={selectedAction?.kind === 'text' ? (selectedAction.fontFamily || activeFontFamily) : activeFontFamily}
              onChange={(e) => handleUpdateTextProperty('fontFamily', e.target.value)}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="Inter, sans-serif">Inter Modern</option>
              <option value="Segoe UI, Tahoma, sans-serif">Segoe UI Clean</option>
              <option value="'Caveat', cursive">Caveat Handwriting</option>
              <option value="'JetBrains Mono', monospace">JetBrains Mono Code</option>
              <option value="'Playfair Display', serif">Playfair Serif</option>
              <option value="'Kalam', cursive">Kalam Marker</option>
              <option value="Arial, Helvetica, sans-serif">Arial Standard</option>
              <option value="'Comic Sans MS', cursive, sans-serif">Comic Sans Casual</option>
            </select>
          </div>

          {/* Font Size Selector */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Size:</span>
            <select
              value={selectedAction?.kind === 'text' ? (selectedAction.fontSize || activeFontSize) : activeFontSize}
              onChange={(e) => handleUpdateTextProperty('fontSize', Number(e.target.value))}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map((sz) => (
                <option key={sz} value={sz}>{sz}px</option>
              ))}
            </select>
          </div>

          {/* Bold & Italic Toggles */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-slate-200 shrink-0">
            <button
              onClick={() => handleUpdateTextProperty('bold', !(selectedAction?.kind === 'text' ? selectedAction.bold : activeFontBold))}
              title="Toggle Bold"
              className={`p-1.5 rounded-lg transition ${
                (selectedAction?.kind === 'text' ? selectedAction.bold : activeFontBold)
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleUpdateTextProperty('italic', !(selectedAction?.kind === 'text' ? selectedAction.italic : activeFontItalic))}
              title="Toggle Italic"
              className={`p-1.5 rounded-lg transition ${
                (selectedAction?.kind === 'text' ? selectedAction.italic : activeFontItalic)
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text Color Picker */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="color"
              value={selectedAction?.kind === 'text' ? (selectedAction.color || strokeColor) : strokeColor}
              onChange={(e) => handleUpdateTextProperty('color', e.target.value)}
              title="Text Color"
              className="w-5 h-5 rounded-full cursor-pointer bg-transparent border-0"
            />
          </div>

          {/* If text box selected: Edit Content and Delete */}
          {selectedAction && selectedAction.kind === 'text' && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 shrink-0">
              <button
                onClick={handleEditTextContent}
                title="Edit text content (or double-click text on canvas)"
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition flex items-center gap-1"
              >
                <span>✎ Edit Text</span>
              </button>
              <button
                onClick={handleDeleteSelected}
                title="Delete this text element"
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

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
        className={`whiteboard-canvas absolute inset-0 z-[1] touch-none bg-transparent ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
          activeTool === 'select' ? 'cursor-default' :
          !myPermissions.can_draw ? 'cursor-not-allowed' : 'cursor-crosshair'
        }`}
      />

      {/* Remote User Cursors Overlay */}
      {!viewingInstance && Array.from(remoteCursors.entries()).map(([code, cur]) => (
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
          room={roomData}
          onUpdateRoomPermissions={handleUpdateRoomPermissions}
          onUpdateMemberCustomPermissions={handleUpdateMemberCustomPermissions}
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
          canChat={isHost || isCohost || myPermissions.can_chat !== false}
        />
      </div>

      {/* Modals */}
      <TableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        onCreateTable={handleCreateTable}
      />

      <ShapesModal
        isOpen={isShapesModalOpen}
        onClose={() => setIsShapesModalOpen(false)}
        activeShape={activeShape}
        onSelectShape={(shapeId) => {
          setActiveShape(shapeId);
          setActiveTool('shape');
        }}
        fillShape={fillShape}
        setFillShape={setFillShape}
        fillColor={fillColor}
        setFillColor={setFillColor}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        roomTitle={roomData?.title || room.title}
        roomCode={room.code}
        actions={currentDisplayActions}
        milestones={milestones}
        members={members}
        canSaveMilestone={isHost || isCohost || myPermissions.can_instances !== false}
        canPublishPublicWork={isHost || isCohost || myPermissions.can_public_work !== false}
        onTakeScreenshot={handleTakeScreenshot}
        onPublishMilestone={handlePublishMilestone}
        onPublishPublicWork={handlePublishPublicWork}
        onShareWithMember={handleShareWithMember}
      />

      <ErrorBoundary fallbackTitle="Instances Modal">
        <InstancesModal
          isOpen={isMilestonesOpen}
          onClose={() => setIsMilestonesOpen(false)}
          milestones={milestones}
          privateMilestones={privateMilestones}
          onSaveMilestone={handlePublishMilestone}
          onShowInstance={(ms) => {
            setViewingInstance({
              id: ms.id,
              title: ms.title,
              actions: JSON.parse(JSON.stringify(ms.snapshot || [])),
              original_snapshot: JSON.parse(JSON.stringify(ms.original_snapshot || ms.snapshot || [])),
              host_sandbox: ms.host_sandbox ? JSON.parse(JSON.stringify(ms.host_sandbox)) : null,
              is_public: ms.is_public !== false
            });
            setSandboxViewMode('sandbox');
            showNotification(`👁️ Sandboxed in instance "${ms.title}". Edits do not modify live canvas.`);
          }}
          onBroadcastShow={handleBroadcastShowInstance}
          onRestoreMilestone={(snapshot, title) => {
            handleRestoreMilestone(snapshot, title);
          }}
          onDeleteMilestone={handleDeleteMilestone}
          canRestore={isHost}
          canSave={isHost || isCohost || myPermissions.can_instances !== false}
          canSharePublic={isHost || myPermissions.can_instances !== false}
          currentUserCode={user?.user_code}
          isHost={isHost}
        />
      </ErrorBoundary>

      <ErrorBoundary fallbackTitle="Public Works Modal">
        <PublicWorksModal
          isOpen={isPublicWorksOpen}
          onClose={() => setIsPublicWorksOpen(false)}
          publicWorks={publicWorks}
          privateWorks={privateScreenshots}
          onDeleteWork={handleDeletePublicWork}
          currentUserCode={user?.user_code}
          isHost={isHost}
          canDelete={isHost || isCohost}
          onOpenExportModal={() => setIsExportModalOpen(true)}
        />
      </ErrorBoundary>

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onAddMember={handleAddMember}
        connectedUsers={connectedUsers}
      />

      {/* Save Destination Modal (2 Options: Private Local vs Public Works) */}
      <SaveDestinationModal
        isOpen={Boolean(saveModalConfig)}
        onClose={() => setSaveModalConfig(null)}
        mode={saveModalConfig?.mode}
        canSharePublic={saveModalConfig?.mode === 'screenshot'
          ? (isHost || myPermissions.can_public_work !== false)
          : (isHost || myPermissions.can_instances !== false)}
        defaultTitle={saveModalConfig?.defaultTitle}
        onConfirm={handleConfirmSaveDestination}
      />

      {/* Bottom Status Pill */}
      <div className="fixed bottom-3 left-4 z-20 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full shadow-md border border-slate-200 text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-teal-500' : 'bg-emerald-500'}`} />
        {statusText}
      </div>
    </div>
  );
}
