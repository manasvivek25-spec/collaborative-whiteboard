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
import PromptModal from './PromptModal';
import ConfirmModal from './ConfirmModal';

function parseActionsSafely(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    try {
      return JSON.parse(JSON.stringify(val));
    } catch(e) {
      return [...val];
    }
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') {
        const double = JSON.parse(parsed);
        if (Array.isArray(double)) return double;
      }
    } catch(e) {}
  }
  return [];
}
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
  Sliders,
  Crop
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

  // Eraser Tool Real-Time Hover & Path State
  const [eraserHoverPos, setEraserHoverPos] = useState(null); // null | { x, y }
  const [lastEraserPoint, setLastEraserPoint] = useState(null); // null | { x, y }

  // Selection & Manipulation State
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null); // { startX, startY, currentX, currentY }
  const [selectedDrag, setSelectedDrag] = useState(null);
  const [selectedResize, setSelectedResize] = useState(null);

  // Snap Area Screenshot Tool State
  const [snapBox, setSnapBox] = useState(null); // { startX, startY, currentX, currentY }
  const [customSnapDataUrl, setCustomSnapDataUrl] = useState(null);

  // Custom Prompt Modal State (Replaces native window.prompt)
  const [promptConfig, setPromptConfig] = useState(null); // { isOpen, title, message, initialValue, onConfirm }
  const showPrompt = useCallback((title, message, initialValue, onConfirm) => {
    setPromptConfig({
      isOpen: true,
      title,
      message,
      initialValue: initialValue || '',
      onConfirm: (val) => {
        onConfirm(val);
        setPromptConfig(null);
      },
      onClose: () => setPromptConfig(null)
    });
  }, []);

  // Custom Confirm Modal State (Replaces native window.confirm)
  const [confirmConfig, setConfirmConfig] = useState(null); // { isOpen, title, message, confirmText, cancelText, confirmColor, onConfirm }
  const showConfirm = useCallback((title, message, onConfirm, { confirmText = 'Confirm', cancelText = 'Cancel', confirmColor = 'teal' } = {}) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      confirmColor,
      onConfirm: () => {
        onConfirm();
        setConfirmConfig(null);
      },
      onClose: () => setConfirmConfig(null)
    });
  }, []);

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

      case 'new_milestone': {
        const ms = msg.milestone;
        if (!ms) break;
        if (msg.is_private) {
          setPrivateMilestones(prev => [ms, ...prev.filter(m => m.id !== ms.id)]);
          try {
            const cur = JSON.parse(localStorage.getItem('my_private_instances') || '[]');
            localStorage.setItem('my_private_instances', JSON.stringify([ms, ...cur.filter(m => m.id !== ms.id)]));
          } catch(e) {}
        } else {
          setMilestones(prev => [ms, ...prev.filter(m => m.id !== ms.id)]);
          try {
            const cur = JSON.parse(localStorage.getItem(`offline_milestones_${room?.code || 'local'}`) || '[]');
            localStorage.setItem(`offline_milestones_${room?.code || 'local'}`, JSON.stringify([ms, ...cur.filter(m => m.id !== ms.id)]));
          } catch(e) {}
        }
        break;
      }

      case 'snapshot_restored': {
        const cleanActs = parseActionsSafely(msg.actions || msg.snapshot);
        setViewingInstance(null);
        setSandboxViewMode('sandbox');
        setActions(cleanActs);
        setRedoStack([]);
        setStatusText(`Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        showNotification(`🔄 Canvas restored to milestone '${msg.title}' by ${msg.restored_by}`);
        break;
      }

      case 'new_public_work': {
        const pw = msg.public_work || msg.work;
        if (!pw) break;
        if (msg.is_private) {
          setPrivateScreenshots(prev => [pw, ...prev.filter(p => p.id !== pw.id)]);
          try {
            const cur = JSON.parse(localStorage.getItem('my_private_screenshots') || '[]');
            localStorage.setItem('my_private_screenshots', JSON.stringify([pw, ...cur.filter(p => p.id !== pw.id)]));
          } catch(e) {}
        } else {
          setPublicWorks(prev => [pw, ...prev.filter(p => p.id !== pw.id)]);
          try {
            const cur = JSON.parse(localStorage.getItem(`offline_public_works_${room?.code || 'local'}`) || '[]');
            localStorage.setItem(`offline_public_works_${room?.code || 'local'}`, JSON.stringify([pw, ...cur.filter(p => p.id !== pw.id)]));
          } catch(e) {}
          if (pw.author_code !== user?.user_code) {
            showNotification(`🖼️ ${pw.author_name} published a screenshot to Public Works!`);
          }
        }
        break;
      }

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

      case 'instance_snapshot_updated': {
        const cleanSnap = parseActionsSafely(msg.snapshot);
        setMilestones(prev => prev.map(m => m.id === msg.instance_id ? { ...m, snapshot: cleanSnap, host_sandbox: cleanSnap } : m));
        if (viewingInstance && viewingInstance.id === msg.instance_id) {
          setViewingInstance(prev => ({ ...prev, actions: cleanSnap, host_sandbox: cleanSnap }));
        }
        showNotification('Milestone instance snapshot updated');
        break;
      }

      case 'show_instance_broadcast': {
        const snap = parseActionsSafely(msg.actions || msg.snapshot);
        setViewingInstance({
          id: msg.instance_id,
          title: msg.title || 'Live Sandbox Instance',
          actions: snap,
          original_snapshot: snap,
          host_sandbox: snap,
          is_public: true
        });
        setSandboxViewMode('sandbox');
        showNotification(`📡 Host broadcasted sandbox instance "${msg.title || 'Instance'}" to everyone live!`);
        break;
      }

      case 'dismiss_instance_broadcast':
        setViewingInstance(null);
        setSandboxViewMode('sandbox');
        showNotification('🚀 Host closed instance broadcast. Returned to live whiteboard.');
        break;

      case 'connected_users_list':
        setConnectedUsers(msg.users || []);
        break;

      case 'received_session_bundle': {
        showNotification(`📦 ${msg.sender_name} shared a whiteboard bundle with you!`);
        showConfirm(
          'Download Whiteboard Bundle',
          `${msg.sender_name} shared a complete whiteboard session bundle ("${msg.bundle?.title || 'Shared Board'}"). Would you like to download this file?`,
          () => {
            const blob = new Blob([JSON.stringify(msg.bundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.download = `${(msg.bundle?.title || 'shared_board').replace(/[^a-zA-Z0-9]/g, '_')}_shared.whiteboard`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          },
          { confirmText: 'Download', confirmColor: 'blue' }
        );
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

  function pointToSegmentDistSq(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
  }

  function isPointInsideAction(act, x, y, curZoom = 1) {
    if (!act || act.undone) return false;

    // Fast broad bounding box rejection
    const b = getActionBBox(act);
    if (!b) return false;
    const pad = Math.max(10, 10 / curZoom);
    if (x < b.x - pad || x > b.x + b.w + pad || y < b.y - pad || y > b.y + b.h + pad) {
      return false;
    }

    if (act.kind === 'sticky' || act.kind === 'table' || act.kind === 'text') {
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }

    if (act.kind === 'rect' || act.kind === 'rounded_rect') {
      if (act.fill && act.fill !== 'transparent' && act.fill !== 'none') {
        return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      }
      const nearLeft = Math.abs(x - b.x) <= pad && y >= b.y - pad && y <= b.y + b.h + pad;
      const nearRight = Math.abs(x - (b.x + b.w)) <= pad && y >= b.y - pad && y <= b.y + b.h + pad;
      const nearTop = Math.abs(y - b.y) <= pad && x >= b.x - pad && x <= b.x + b.w + pad;
      const nearBottom = Math.abs(y - (b.y + b.h)) <= pad && x >= b.x - pad && x <= b.x + b.w + pad;
      return nearLeft || nearRight || nearTop || nearBottom;
    }

    if (act.kind === 'circle') {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = Math.min(b.w, b.h) / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (act.fill && act.fill !== 'transparent' && act.fill !== 'none') {
        return d <= r + pad;
      }
      return Math.abs(d - r) <= pad;
    }

    if (act.kind === 'line' || act.kind === 'arrow') {
      const thresh = Math.max(10, (act.width || 4) * 1.5) / curZoom;
      const distSq = pointToSegmentDistSq(x, y, act.x1, act.y1, act.x2, act.y2);
      return distSq <= thresh * thresh;
    }

    if (act.kind === 'stroke') {
      const pts = act.points;
      if (!pts || pts.length < 1) return false;
      const thresh = Math.max(10, (act.width || 4) * 1.5) / curZoom;
      const threshSq = thresh * thresh;

      if (pts.length === 1) {
        return ((x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2) <= threshSq;
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const dSq = pointToSegmentDistSq(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (dSq <= threshSq) return true;
      }
      return false;
    }

    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  function isActionHitByEraser(act, x, y, radius, curZoom = 1) {
    if (!act || act.undone) return false;
    if (act.brush === 'eraser') return false;

    const b = getActionBBox(act);
    if (!b) return false;

    const r = Math.max(10, radius);
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) {
      return false;
    }

    if (act.kind === 'sticky' || act.kind === 'table' || act.kind === 'text') {
      return (
        x >= b.x - r &&
        x <= b.x + b.w + r &&
        y >= b.y - r &&
        y <= b.y + b.h + r
      );
    }

    if (act.kind === 'rect' || act.kind === 'rounded_rect') {
      if (act.fill && act.fill !== 'transparent' && act.fill !== 'none') {
        return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
      }
      const nearLeft = Math.abs(x - b.x) <= r && y >= b.y - r && y <= b.y + b.h + r;
      const nearRight = Math.abs(x - (b.x + b.w)) <= r && y >= b.y - r && y <= b.y + b.h + r;
      const nearTop = Math.abs(y - b.y) <= r && x >= b.x - r && x <= b.x + b.w + r;
      const nearBottom = Math.abs(y - (b.y + b.h)) <= r && x >= b.x - r && x <= b.x + b.w + r;
      return nearLeft || nearRight || nearTop || nearBottom;
    }

    if (act.kind === 'circle') {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const circleR = Math.min(b.w, b.h) / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (act.fill && act.fill !== 'transparent' && act.fill !== 'none') {
        return d <= circleR + r;
      }
      return Math.abs(d - circleR) <= r;
    }

    if (act.kind === 'line' || act.kind === 'arrow') {
      const thresh = Math.max(r, (act.width || 4) / 2);
      const distSq = pointToSegmentDistSq(x, y, act.x1, act.y1, act.x2, act.y2);
      return distSq <= thresh * thresh;
    }

    if (act.kind === 'stroke') {
      const pts = act.points;
      if (!pts || pts.length < 1) return false;
      const thresh = Math.max(r, (act.width || 4) / 2);
      const threshSq = thresh * thresh;

      if (pts.length === 1) {
        return ((x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2) <= threshSq;
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const dSq = pointToSegmentDistSq(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (dSq <= threshSq) return true;
      }
      return false;
    }

    return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
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

    // Render selection drag marquee box
    if (selectionBox) {
      const bx = Math.min(selectionBox.startX, selectionBox.currentX);
      const by = Math.min(selectionBox.startY, selectionBox.currentY);
      const bw = Math.abs(selectionBox.currentX - selectionBox.startX);
      const bh = Math.abs(selectionBox.currentY - selectionBox.startY);
      ctx.save();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }

    // Render Snap Area Screenshot Box
    if (snapBox) {
      const cx = Math.min(snapBox.startX, snapBox.currentX);
      const cy = Math.min(snapBox.startY, snapBox.currentY);
      const cw = Math.abs(snapBox.currentX - snapBox.startX);
      const ch = Math.abs(snapBox.currentY - snapBox.startY);

      ctx.save();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.setLineDash([]);

      const dimText = `✂️ ${Math.round(cw)} × ${Math.round(ch)} px`;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      const pillY = cy + ch + 8;
      if (ctx.roundRect) ctx.roundRect(cx, pillY, 110, 22, [6]);
      else ctx.rect(cx, pillY, 110, 22);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(dimText, cx + 8, pillY + 15);
      ctx.restore();
    }

    // Render group selection outline & handles if multiple items are selected
    if (selectedIds && selectedIds.length > 1) {
      const bboxes = selectedIds.map(id => {
        const a = currentDisplayActions.find(act => act.id === id && !act.undone);
        return a ? getActionBBox(a) : null;
      }).filter(Boolean);

      if (bboxes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        bboxes.forEach(b => {
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.w > maxX) maxX = b.x + b.w;
          if (b.y + b.h > maxY) maxY = b.y + b.h;
        });
        const groupW = maxX - minX;
        const groupH = maxY - minY;

        ctx.save();
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        bboxes.forEach(b => {
          ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        });

        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(minX - 6, minY - 6, groupW + 12, groupH + 12);
        ctx.setLineDash([]);

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(minX - 6, minY - 32, 95, 22, [6]);
        else ctx.rect(minX - 6, minY - 32, 95, 22);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`✥ Move (${selectedIds.length})`, minX + 2, minY - 17);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(minX + groupW - 14, minY - 32, 22, 22, [6]);
        else ctx.rect(minX + groupW - 14, minY - 32, 22, 22);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('✕', minX + groupW - 8, minY - 17);
        ctx.restore();
      }
    } else if (selectedId) {
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

    // Render live circular eraser preview under cursor
    if (activeTool === 'eraser' && eraserHoverPos) {
      const radius = Math.max(14, strokeWidth * 2.5);
      ctx.save();
      ctx.beginPath();
      ctx.arc(eraserHoverPos.x, eraserHoverPos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isDrawing ? '#ef4444' : '#64748b';
      ctx.lineWidth = 2 / zoom;
      ctx.fillStyle = isDrawing ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.1)';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [currentDisplayActions, streamingStrokes, currentStroke, currentPreviewPoint, shapeStart, activeShape, activeTool, strokeColor, strokeWidth, fillShape, fillColor, zoom, panOffset, drawInfiniteGrid, selectedTableId, selectedId, selectedIds, selectionBox, snapBox, eraserHoverPos, isDrawing]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Stroke renderer
  function renderStroke(ctx, points, color, width, brush, opacity = 1) {
    if (!points || points.length < 1) return;
    if (brush === 'eraser') return; // Completely ignore legacy eraser stroke masks
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
    if (!act || act.undone) return;
    if (act.brush === 'eraser') return; // Skip any legacy eraser stroke layers

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

  // ── ACTUAL REAL-TIME ELEMENT & STROKE ERASER ENGINE ────────────────
  const eraseAtPoint = useCallback((x, y) => {
    if (!myPermissions.can_draw && !viewingInstance) {
      return;
    }
    const radius = Math.max(14, strokeWidth * 2.5);
    const hitActs = [];
    for (const act of currentDisplayActions) {
      if (act.undone || act.brush === 'eraser') continue;
      if (isActionHitByEraser(act, x, y, radius, zoom)) {
        hitActs.push(act);
      }
    }
    if (hitActs.length > 0) {
      hitActs.forEach(act => {
        if (selectedId === act.id) setSelectedId(null);
        if (selectedTableId === act.id) setSelectedTableId(null);
        commitAction({ ...act, undone: true });
      });
      setSelectedIds(prev => prev.filter(id => !hitActs.some(h => h.id === id)));
    }
  }, [currentDisplayActions, myPermissions.can_draw, viewingInstance, strokeWidth, zoom, selectedId, selectedTableId]);

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

    // ── SNAP AREA SCREENSHOT TOOL (Highest Priority) ─────────────────────
    if (activeTool === 'snap') {
      setSnapBox({ startX: x, startY: y, currentX: x, currentY: y });
      return;
    }

    // ── ERASER TOOL (Real-Time Object & Stroke Eraser) ───────────────────
    if (activeTool === 'eraser') {
      setIsDrawing(true);
      setLastEraserPoint({ x, y });
      setEraserHoverPos({ x, y });
      eraseAtPoint(x, y);
      return;
    }

    // ── GENERIC SELECTION TOOL (Windows-style Marquee & Drag) ────────────
    if (activeTool === 'select') {
      // 1. Group interaction if multiple elements selected
      if (selectedIds && selectedIds.length > 1) {
        const bboxes = selectedIds.map(id => {
          const a = currentDisplayActions.find(act => act.id === id && !act.undone);
          return a ? getActionBBox(a) : null;
        }).filter(Boolean);

        if (bboxes.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          bboxes.forEach(b => {
            if (b.x < minX) minX = b.x;
            if (b.y < minY) minY = b.y;
            if (b.x + b.w > maxX) maxX = b.x + b.w;
            if (b.y + b.h > maxY) maxY = b.y + b.h;
          });
          const groupW = maxX - minX;

          // Check click on group delete button
          if (x >= minX + groupW - 14 && x <= minX + groupW + 8 && y >= minY - 32 && y <= minY - 10) {
            selectedIds.forEach(id => {
              const act = currentDisplayActions.find(a => a.id === id);
              if (act) commitAction({ ...act, undone: true });
            });
            showNotification(`${selectedIds.length} items deleted`);
            setSelectedIds([]);
            setSelectedId(null);
            return;
          }

          // Check click on group move pill or on ANY selected element
          const clickedOnSelectedItem = selectedIds.some(id => {
            const act = currentDisplayActions.find(a => a.id === id);
            return isPointInsideAction(act, x, y, zoom);
          });
          const insideGroup = (x >= minX - 6 && x <= maxX + 6 && y >= minY - 32 && y <= maxY + 6);

          if (clickedOnSelectedItem || insideGroup) {
            setSelectedDrag({
              items: selectedIds.map(id => {
                const act = currentDisplayActions.find(a => a.id === id);
                return act ? { id: act.id, act: JSON.parse(JSON.stringify(act)) } : null;
              }).filter(Boolean),
              startX: x,
              startY: y
            });
            return;
          }
        }
      }

      // 2. Single item selection handles
      if (selectedId) {
        const selAct = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
        if (selAct) {
          const bbox = getActionBBox(selAct);
          if (bbox) {
            // Delete handle
            if (x >= bbox.x + bbox.w - 20 && x <= bbox.x + bbox.w && y >= bbox.y - 26 && y <= bbox.y - 6) {
              commitAction({ ...selAct, undone: true });
              setSelectedId(null);
              setSelectedIds([]);
              showNotification('Item deleted');
              return;
            }

            // Drag handle pill
            if (x >= bbox.x && x <= bbox.x + 64 && y >= bbox.y - 26 && y <= bbox.y - 6) {
              setSelectedDrag({
                id: selAct.id,
                items: [{ id: selAct.id, act: JSON.parse(JSON.stringify(selAct)) }],
                startX: x,
                startY: y
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

      // 3. Pixel-accurate hit-test on all visible actions
      let hitId = null;
      for (let i = currentDisplayActions.length - 1; i >= 0; i--) {
        const act = currentDisplayActions[i];
        if (act.undone) continue;
        if (isPointInsideAction(act, x, y, zoom)) {
          hitId = act.id;
          break;
        }
      }

      if (hitId) {
        setSelectedId(hitId);
        setSelectedIds([hitId]);
        const hitAct = currentDisplayActions.find(a => a.id === hitId);

        // Double click text to edit
        if (hitAct && hitAct.kind === 'text' && e.detail === 2) {
          showPrompt('Edit Canvas Text', '', hitAct.text || '', (newText) => {
            if (newText !== null && newText !== hitAct.text) {
              commitAction({ ...hitAct, text: newText });
            }
          });
          return;
        }

        setSelectedDrag({
          id: hitId,
          items: [{ id: hitId, act: JSON.parse(JSON.stringify(hitAct)) }],
          startX: x,
          startY: y
        });
        return;
      }

      // 4. Clicked on empty space: clear selection and start Windows-style marquee box selection
      setSelectedId(null);
      setSelectedIds([]);
      setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
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
          showPrompt(`Edit Table Cell (Row ${r + 1}, Col ${c + 1})`, '', currentVal, (newVal) => {
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
          });
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
          showPrompt('Edit Sticky Note', '', st.text || '', (newText) => {
            if (newText !== null && newText !== st.text) {
              commitAction({ ...st, text: newText });
            }
          });
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
          showPrompt('Edit Sticky Note', '', st.text || '', (newText) => {
            if (newText !== null && newText !== st.text) {
              commitAction({ ...st, text: newText });
            }
          });
        }
        setStickyDrag(null);
        setIsDrawing(false);
        return;
      }
    }

    // Unselect if clicked elsewhere
    if (selectedTableId) setSelectedTableId(null);
    if (selectedId) setSelectedId(null);
    if (selectedIds.length > 0) setSelectedIds([]);

    // Permission Enforcement
    if (!myPermissions.can_draw) {
      showNotification('🔒 Drawing is disabled for you by the Host.');
      return;
    }

    setIsDrawing(true);

    if (['pencil', 'brush', 'highlighter'].includes(activeTool)) {
      const strokeId = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const strokeObj = {
        id: strokeId,
        kind: 'stroke',
        points: [[x, y]],
        color: strokeColor,
        width: strokeWidth,
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
      showPrompt('Add Text to Canvas', '', '', (text) => {
        if (text && text.trim()) {
          const textAction = {
            id: `text_${Date.now()}`,
            kind: 'text',
            text: text.trim(),
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
          setSelectedIds([textAction.id]);
        }
      });
      setIsDrawing(false);
    } else if (activeTool === 'sticky') {
      showPrompt('Create Sticky Note', '', '', (text) => {
        if (text && text.trim()) {
          const stickyAction = {
            id: `sticky_${Date.now()}`,
            kind: 'sticky',
            text: text.trim(),
            x,
            y,
            w: 160,
            h: 120,
            bgColor: '#fef08a'
          };
          commitAction(stickyAction);
          setSelectedId(stickyAction.id);
          setSelectedIds([stickyAction.id]);
        }
      });
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

    // Handle Eraser Tool Hover & Real-Time Object/Stroke Erasing
    if (activeTool === 'eraser') {
      setEraserHoverPos({ x, y });
      if (isDrawing) {
        if (lastEraserPoint) {
          const dist = Math.hypot(x - lastEraserPoint.x, y - lastEraserPoint.y);
          const steps = Math.max(1, Math.ceil(dist / 8));
          for (let s = 1; s <= steps; s++) {
            const ix = lastEraserPoint.x + (x - lastEraserPoint.x) * (s / steps);
            const iy = lastEraserPoint.y + (y - lastEraserPoint.y) * (s / steps);
            eraseAtPoint(ix, iy);
          }
        } else {
          eraseAtPoint(x, y);
        }
        setLastEraserPoint({ x, y });
      }
      return;
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

    // Handle Snap Area Screenshot Box Dragging
    if (snapBox) {
      setSnapBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
      return;
    }

    // Handle Selection Marquee Box Dragging (Windows-style live item highlighting)
    if (selectionBox) {
      const curX = x;
      const curY = y;
      const minX = Math.min(selectionBox.startX, curX);
      const maxX = Math.max(selectionBox.startX, curX);
      const minY = Math.min(selectionBox.startY, curY);
      const maxY = Math.max(selectionBox.startY, curY);

      // Find all intersecting actions in real time as the marquee box expands
      const liveMatched = [];
      for (const act of currentDisplayActions) {
        if (act.undone) continue;
        const b = getActionBBox(act);
        if (b) {
          const intersects = !(b.x > maxX || b.x + b.w < minX || b.y > maxY || b.y + b.h < minY);
          if (intersects) liveMatched.push(act.id);
        }
      }

      setSelectedIds(liveMatched);
      setSelectedId(liveMatched[0] || null);
      setSelectionBox(prev => prev ? { ...prev, currentX: curX, currentY: curY } : null);
      return;
    }

    // Handle Generic Selected Dragging (Single or Multi-item Group)
    if (selectedDrag) {
      const dx = x - selectedDrag.startX;
      const dy = y - selectedDrag.startY;

      const itemsMap = new Map();
      if (selectedDrag.items && selectedDrag.items.length > 0) {
        selectedDrag.items.forEach(it => itemsMap.set(it.id, it.act));
      } else if (selectedDrag.id && selectedDrag.act) {
        itemsMap.set(selectedDrag.id, selectedDrag.act);
      }

      const updateFn = (list) => list.map(a => {
        const orig = itemsMap.get(a.id);
        if (orig) {
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

    if (activeTool === 'eraser') {
      setIsDrawing(false);
      setLastEraserPoint(null);
      return;
    }

    if (snapBox) {
      const cropX = Math.min(snapBox.startX, snapBox.currentX);
      const cropY = Math.min(snapBox.startY, snapBox.currentY);
      const cropW = Math.abs(snapBox.currentX - snapBox.startX);
      const cropH = Math.abs(snapBox.currentY - snapBox.startY);
      if (cropW > 12 && cropH > 12) {
        const dataUrl = captureAreaScreenshotDataUrl(cropX, cropY, cropW, cropH);
        if (dataUrl) {
          setCustomSnapDataUrl(dataUrl);
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
          setSaveModalConfig({
            mode: 'screenshot',
            defaultTitle: `Area_Snap_${timeStr}`
          });
        }
      }
      setSnapBox(null);
      setActiveTool('select');
      return;
    }

    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);
      const boxW = maxX - minX;
      const boxH = maxY - minY;

      if (boxW > 5 || boxH > 5) {
        const matched = [];
        for (const act of currentDisplayActions) {
          if (act.undone) continue;
          const b = getActionBBox(act);
          if (b) {
            const intersects = !(b.x > maxX || b.x + b.w < minX || b.y > maxY || b.y + b.h < minY);
            if (intersects) matched.push(act.id);
          }
        }
        setSelectedIds(matched);
        setSelectedId(matched[0] || null);
        if (matched.length > 0) {
          showNotification(`Selected ${matched.length} element${matched.length > 1 ? 's' : ''}`);
        }
      }
      setSelectionBox(null);
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
      if (selectedDrag.items && selectedDrag.items.length > 0) {
        selectedDrag.items.forEach(item => {
          const modified = currentDisplayActions.find(a => a.id === item.id);
          if (modified) commitAction(modified);
        });
      } else if (selectedDrag.id) {
        const modified = currentDisplayActions.find(a => a.id === selectedDrag.id);
        if (modified) commitAction(modified);
      }
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
      showConfirm(
        'Clear Sandbox Instance',
        'Clear all drawings and items in this sandbox simulation?',
        () => {
          setViewingInstance(prev => ({ ...prev, actions: [] }));
          showNotification('🧹 Cleared drawings in sandbox instance');
        },
        { confirmText: 'Clear Sandbox', confirmColor: 'red' }
      );
      return;
    }

    if (!isHost && !isCohost) {
      showNotification('⚠️ Only the host or co-host can clear the canvas for all participants.');
      return;
    }
    showConfirm(
      'Clear Collaborative Whiteboard',
      'Clear all drawings and items on the whiteboard for everyone in this session?',
      () => {
        setActions([]);
        setRedoStack([]);
        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clear_canvas' }));
        }
        showNotification('🧹 Whiteboard canvas cleared');
      },
      { confirmText: 'Clear Board', confirmColor: 'red' }
    );
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
    showConfirm(
      'Remove Member',
      'Remove this member from the session?',
      () => {
        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'host_control',
            action: 'kick',
            target_user_code: targetUserCode
          }));
        }
      },
      { confirmText: 'Remove', confirmColor: 'red' }
    );
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
  const captureAreaScreenshotDataUrl = (cropLeft, cropTop, cropW, cropH) => {
    if (cropW < 10 || cropH < 10) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.round(cropW));
    offscreen.height = Math.max(1, Math.round(cropH));
    const oCtx = offscreen.getContext('2d');
    if (!oCtx) return null;

    // 1. Solid crisp white background
    oCtx.fillStyle = '#ffffff';
    oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    // 2. Render all visible elements shifted by (-cropLeft, -cropTop)
    oCtx.save();
    oCtx.translate(-cropLeft, -cropTop);
    for (const act of currentDisplayActions) {
      if (!act.undone) {
        renderAction(oCtx, act);
      }
    }
    oCtx.restore();

    return offscreen.toDataURL('image/png');
  };

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

  const handleConfirmSaveDestination = ({ destination, title, forcedMode = null }) => {
    const isPublic = destination === 'public';
    const mode = forcedMode || saveModalConfig?.mode || 'instance';

    if (mode === 'screenshot') {
      const dataUrl = customSnapDataUrl || captureScreenshotDataUrl();
      setCustomSnapDataUrl(null);
      if (!dataUrl) return;

      const workId = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const workObj = {
        id: workId,
        title: (title || 'Canvas Snapshot').trim(),
        image_data: dataUrl,
        is_public: isPublic,
        author_code: user?.user_code || 'local',
        author_name: user?.name || 'Local User',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (isPublic) {
        // Instant optimistic update in React state
        setPublicWorks(prev => [workObj, ...prev.filter(p => p.id !== workId)]);
        try {
          const cur = JSON.parse(localStorage.getItem(`offline_public_works_${room?.code || 'local'}`) || '[]');
          localStorage.setItem(`offline_public_works_${room?.code || 'local'}`, JSON.stringify([workObj, ...cur.filter(p => p.id !== workId)]));
        } catch(e) {}

        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'save_public_work',
            id: workId,
            title: workObj.title,
            image_data: dataUrl,
            is_public: 1
          }));
        }
        showNotification(`🌐 Published screenshot "${workObj.title}" to Public Works!`);
      } else {
        // Save to My Own System (Private Screenshot)
        setPrivateScreenshots(prev => [workObj, ...prev.filter(p => p.id !== workId)]);
        try {
          const cur = JSON.parse(localStorage.getItem('my_private_screenshots') || '[]');
          localStorage.setItem('my_private_screenshots', JSON.stringify([workObj, ...cur.filter(p => p.id !== workId)]));
        } catch(e) {}

        // Trigger local file download
        const a = document.createElement('a');
        a.download = `${workObj.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
        a.href = dataUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showNotification(`💾 Screenshot saved to your own system files!`);
      }

      // Log user activity
      try {
        fetch('/api/user/log-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_code: user?.user_code || 'GUEST',
            room_code: room?.code || 'LOCAL',
            action_type: 'SAVE_SNAPSHOT',
            details: `Saved ${isPublic ? 'public' : 'private'} snapshot "${workObj.title}"`
          })
        }).catch(() => {});
      } catch(e) {}

    } else if (mode === 'instance') {
      const unUndoneActions = currentDisplayActions.filter(a => a && !a.undone);
      const msId = `ms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const msObj = {
        id: msId,
        title: (title || 'Whiteboard Instance').trim(),
        is_public: isPublic,
        author_code: user?.user_code || 'local',
        author_name: user?.name || 'Local User',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        snapshot: unUndoneActions,
        original_snapshot: unUndoneActions,
        host_sandbox: unUndoneActions
      };

      if (isPublic) {
        // Instant optimistic update in React state
        setMilestones(prev => [msObj, ...prev.filter(m => m.id !== msId)]);
        try {
          const cur = JSON.parse(localStorage.getItem(`offline_milestones_${room?.code || 'local'}`) || '[]');
          localStorage.setItem(`offline_milestones_${room?.code || 'local'}`, JSON.stringify([msObj, ...cur.filter(m => m.id !== msId)]));
        } catch(e) {}

        if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'save_milestone',
            id: msId,
            title: msObj.title,
            snapshot: unUndoneActions,
            is_public: 1
          }));
        }
        showNotification(`🌐 Published instance "${msObj.title}" to room Public Works!`);
      } else {
        // Save to My Own System (Private Instance)
        setPrivateMilestones(prev => [msObj, ...prev.filter(m => m.id !== msId)]);
        try {
          const cur = JSON.parse(localStorage.getItem('my_private_instances') || '[]');
          localStorage.setItem('my_private_instances', JSON.stringify([msObj, ...cur.filter(m => m.id !== msId)]));
        } catch(e) {}

        showNotification(`💾 Instance "${msObj.title}" saved to your own local system!`);
      }

      // Log user activity
      try {
        fetch('/api/user/log-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_code: user?.user_code || 'GUEST',
            room_code: room?.code || 'LOCAL',
            action_type: 'SAVE_INSTANCE',
            details: `Saved ${isPublic ? 'public' : 'private'} milestone instance "${msObj.title}"`
          })
        }).catch(() => {});
      } catch(e) {}
    }

    setSaveModalConfig(null);
  };

  const handlePublishMilestone = (optionsOrTitle) => {
    if (typeof optionsOrTitle === 'object' && optionsOrTitle !== null) {
      handleConfirmSaveDestination({
        destination: optionsOrTitle.destination || 'public',
        title: optionsOrTitle.title || `Instance - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        forcedMode: 'instance'
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
        title: optionsOrTitle.title || `Screenshot - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        forcedMode: 'screenshot'
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
      showPrompt('Edit Text Content', '', act.text || '', (newText) => {
        if (newText !== null && newText !== act.text) {
          commitAction({ ...act, text: newText });
        }
      });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds && selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const act = currentDisplayActions.find(a => a.id === id && !a.undone);
        if (act) commitAction({ ...act, undone: true });
      });
      showNotification(`${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} deleted`);
      setSelectedIds([]);
      setSelectedId(null);
      return;
    }
    if (selectedId) {
      const act = currentDisplayActions.find(a => a.id === selectedId && !a.undone);
      if (act) {
        commitAction({ ...act, undone: true });
        setSelectedId(null);
      }
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
    const cleanActions = parseActionsSafely(snapshot);
    setViewingInstance(null);
    setSandboxViewMode('sandbox');
    setActions(cleanActions);
    setRedoStack([]);

    if (isOffline) {
      try {
        localStorage.setItem(`offline_actions_${room?.code || 'local'}`, JSON.stringify(cleanActions));
      } catch(e) {}
    } else if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'restore_milestone',
        actions: cleanActions,
        title: title || 'Restored Milestone'
      }));
    }
    showNotification(`🔄 Canvas restored to milestone "${title || 'Instance'}"`);
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
    let rawSnap = [];
    if (viewingInstance && viewingInstance.id === ms.id) {
      rawSnap = sandboxViewMode === 'original'
        ? (viewingInstance.original_snapshot || viewingInstance.actions)
        : sandboxViewMode === 'host_sandbox'
        ? (viewingInstance.host_sandbox || viewingInstance.actions)
        : (viewingInstance.actions || viewingInstance.snapshot);
    } else {
      rawSnap = ms.actions || ms.host_sandbox || ms.snapshot || ms.original_snapshot || [];
    }
    const snapToBroadcast = parseActionsSafely(rawSnap);

    if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'broadcast_instance_show',
        instance_id: ms.id,
        title: ms.title || 'Sandbox Instance',
        snapshot: snapToBroadcast,
        actions: snapToBroadcast
      }));
    }
    showNotification(`📡 Broadcasted sandbox instance "${ms.title || 'Instance'}" to everyone on live canvas!`);
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
            <span className="hidden md:inline">Screenshot & Export</span>
          </button>

          {/* Dedicated Quick Snap Area Screenshot Trigger */}
          <button
            onClick={() => setActiveTool('snap')}
            title="Snap Custom Canvas Area (Click and drag box to capture screenshot)"
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-2xs ${
              activeTool === 'snap'
                ? 'bg-cyan-600 text-white ring-2 ring-cyan-400'
                : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-300'
            }`}
          >
            <Crop className="w-3.5 h-3.5 text-cyan-600" />
            <span className="hidden sm:inline">Snap Area</span>
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
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition flex items-center gap-1 text-xs font-bold border border-amber-400 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-white" />
                <span className="hidden md:inline">Show on Live Canva</span>
              </button>
            )}

            {/* Host Control: Dismiss Broadcast for All */}
            {isHost && (
              <button
                onClick={() => {
                  if (!isOffline && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'dismiss_instance_broadcast' }));
                  }
                  handleReturnToLiveState();
                }}
                title="Host Action: Close broadcast and return everyone to live whiteboard"
                className="px-2 py-1 bg-amber-800 hover:bg-amber-900 text-amber-100 rounded-lg transition flex items-center gap-1 text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Dismiss Broadcast</span>
              </button>
            )}

            {/* Host Control: Restore to Live Canva */}
            {isHost && (
              <button
                onClick={() => {
                  const snap = sandboxViewMode === 'original'
                    ? (viewingInstance.original_snapshot || viewingInstance.actions)
                    : (viewingInstance.actions || viewingInstance.snapshot);
                  showConfirm(
                    'Restore Collaborative Canvas',
                    `Restore live canvas to "${viewingInstance.title}" (${sandboxViewMode})?\n\nThis will apply this instance's drawings to everyone's active whiteboard.`,
                    () => handleRestoreMilestone(snap, viewingInstance.title),
                    { confirmText: 'Restore Live', confirmColor: 'teal' }
                  );
                }}
                title="Host Action: Restore this instance state to live whiteboard"
                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition flex items-center gap-1 text-xs font-bold shadow-xs cursor-pointer"
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
        onPointerLeave={() => {
          setEraserHoverPos(null);
          setLastEraserPoint(null);
          if (activeTool === 'eraser') setIsDrawing(false);
        }}
        className={`whiteboard-canvas absolute inset-0 z-[1] touch-none bg-transparent ${
          activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' :
          activeTool === 'select' ? 'cursor-default' :
          activeTool === 'eraser' ? 'cursor-none' :
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
        onStartAreaSnap={() => setActiveTool('snap')}
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
            const cleanActs = parseActionsSafely(ms.actions || ms.snapshot);
            const cleanOrig = parseActionsSafely(ms.original_snapshot || ms.snapshot || ms.actions);
            const cleanHost = ms.host_sandbox ? parseActionsSafely(ms.host_sandbox) : null;
            setViewingInstance({
              id: ms.id,
              title: ms.title,
              actions: cleanActs,
              original_snapshot: cleanOrig,
              host_sandbox: cleanHost,
              is_public: ms.is_public !== false
            });
            setSandboxViewMode('sandbox');
            showNotification(`👁️ Sandboxed in instance "${ms.title}". Edits do not modify live canvas.`);
          }}
          onBroadcastShow={handleBroadcastShowInstance}
          onRestoreMilestone={(snapshot, title) => {
            showConfirm(
              'Restore Collaborative Canvas',
              `Restore live canvas to "${title}"?\n\nThis will apply this instance's drawings to everyone's active whiteboard.`,
              () => handleRestoreMilestone(snapshot, title),
              { confirmText: 'Restore Live', confirmColor: 'teal' }
            );
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

      {/* Snap Area Screenshot Floating Helper Banner */}
      {activeTool === 'snap' && (
        <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-slate-900/90 text-white rounded-full shadow-2xl border border-cyan-500/50 text-xs font-semibold flex items-center gap-2 backdrop-blur-md animate-fade-in pointer-events-auto">
          <Crop className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>✂️ Drag a box across any canvas area to capture screenshot (Esc to cancel)</span>
          <button
            onClick={() => setActiveTool('select')}
            className="ml-2 text-slate-400 hover:text-white font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dynamic Custom Prompt Modal (Eliminates native alerts and prompts) */}
      <PromptModal
        isOpen={Boolean(promptConfig?.isOpen)}
        title={promptConfig?.title}
        message={promptConfig?.message}
        initialValue={promptConfig?.initialValue}
        onConfirm={promptConfig?.onConfirm}
        onClose={promptConfig?.onClose}
      />

      {/* Dynamic Custom Confirm Modal (Eliminates native window.confirm) */}
      <ConfirmModal
        isOpen={Boolean(confirmConfig?.isOpen)}
        title={confirmConfig?.title}
        message={confirmConfig?.message}
        confirmText={confirmConfig?.confirmText}
        cancelText={confirmConfig?.cancelText}
        confirmColor={confirmConfig?.confirmColor}
        onConfirm={confirmConfig?.onConfirm}
        onClose={confirmConfig?.onClose}
      />

      {/* Bottom Status Pill */}
      <div className="fixed bottom-3 left-4 z-20 px-3 py-1 bg-white/90 backdrop-blur-md rounded-full shadow-md border border-slate-200 text-[11px] text-slate-600 font-medium flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-teal-500' : 'bg-emerald-500'}`} />
        {statusText}
      </div>
    </div>
  );
}
