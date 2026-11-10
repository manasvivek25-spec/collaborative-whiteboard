import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Download, Trash2, X, MessageSquare, ShieldAlert } from 'lucide-react';

const EMOJIS = ['👍', '❤️', '👏', '🔥', '🎉', '💡', '🚀', '😂', '✋'];

export default function ChatDrawer({
  isOpen,
  onClose,
  messages = [],
  onSendMessage,
  onClearChat,
  isHost = false,
  currentUserCode = ''
}) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
    setShowEmojiPicker(false);
  };

  const handleEmojiClick = (emoji) => {
    setText((prev) => prev + emoji);
  };

  const exportChat = () => {
    const lines = messages.map(m => `[${m.timestamp}] ${m.sender_name}: ${m.message}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-80 sm:w-96 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl animate-slide-in z-30">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-800">Room Chat</h3>
          <span className="text-xs text-slate-500 font-medium">({messages.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={exportChat}
            title="Export chat log"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition"
          >
            <Download className="w-4 h-4" />
          </button>
          {isHost && (
            <button
              onClick={onClearChat}
              title="Clear chat history"
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs font-semibold">No messages yet</p>
            <p className="text-[11px] mt-1">Start chatting with participants in this whiteboard room!</p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.sender_code === currentUserCode;
            if (m.is_system) {
              return (
                <div key={m.id || idx} className="flex justify-center my-2">
                  <span className="px-3 py-1 bg-slate-200/80 text-slate-700 text-[11px] rounded-full text-center font-medium shadow-sm">
                    {m.message}
                  </span>
                </div>
              );
            }

            return (
              <div key={m.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-bold text-slate-700">
                    {isMe ? 'You' : m.sender_name}
                  </span>
                  <span className="text-[10px] text-slate-400">{m.timestamp}</span>
                </div>
                <div
                  className={`px-3.5 py-2 rounded-2xl max-w-[85%] text-xs shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  }`}
                >
                  {m.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emoji Reactions */}
      <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between bg-white">
        <div className="flex gap-1 overflow-x-auto py-1">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleEmojiClick(em)}
              className="hover:scale-125 transition-transform text-base px-1"
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 bg-white flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

