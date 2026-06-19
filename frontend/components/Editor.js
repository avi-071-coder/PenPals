'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { initYjs, destroyYjs } from '../lib/yjs';
import * as Y from 'yjs';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';

// Register custom fonts and custom sizes in Quill
if (typeof window !== 'undefined') {
  // Fonts Whitelist
  const Font = Quill.import('formats/font');
  Font.whitelist = ['sans-serif', 'serif', 'monospace', 'calibri', 'arial', 'arial-narrow', 'georgia', 'impact'];
  Quill.register(Font, true);

  // Custom Sizes Whitelist
  const Size = Quill.import('formats/size');
  Size.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'];
  Quill.register(Size, true);
}

// Script loading helper for CDNs
const loadScript = (src) => {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
};

const COMMANDS = [
  { id: 'bullet', name: 'Bullet List', desc: 'Simple bulleted list', type: 'format', format: 'list', value: 'bullet', icon: '•' },
  { id: 'ordered', name: 'Numbered List', desc: 'Sequential numbered list', type: 'format', format: 'list', value: 'ordered', icon: '1.' },
  { id: 'code', name: 'Code Block', desc: 'Formatted code block', type: 'format', format: 'code-block', value: true, icon: '</>' },
  { id: 'quote', name: 'Quote', desc: 'Blockquote highlight', type: 'format', format: 'blockquote', value: true, icon: '“' },
];

const Editor = ({ roomId, initialUsername, initialColor, initialTheme, forcedReadOnly }) => {
  const quillRef = useRef();
  const socketRef = useRef();
  
  // States
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState([]);
  const [editorContainer, setEditorContainer] = useState(null);
  
  // Theme & Read-Only / Owner states
  const [currentTheme, setCurrentTheme] = useState(initialTheme || 'glass');
  const [isOwner, setIsOwner] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [isPersonallyBlocked, setIsPersonallyBlocked] = useState(false);
  
  // Sidebars
  const [chatOpen, setChatOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  
  // Chat Fields
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  
  // Version History Fields
  const [versionNameInput, setVersionNameInput] = useState('');
  const [versionHistoryList, setVersionHistoryList] = useState([]);
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [editingVersionName, setEditingVersionName] = useState('');
  
  // Image & Link Modals
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  
  // Modal Fields
  const [imageUrl, setImageUrl] = useState('');
  const [imageTab, setImageTab] = useState('upload'); // 'upload' | 'url'
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // Anytime Selection & Style Customizer Overlay
  const [selectedElement, setSelectedElement] = useState(null);
  const [overlayRect, setOverlayRect] = useState(null);

  // Formatting Inspector
  const [activeFormats, setActiveFormats] = useState([]);
  
  // Save status
  const [saveStatus, setSaveStatus] = useState('Saved');
  const saveTimeoutRef = useRef(null);
  
  // Slash Command Menu
  const [slashMenuPosition, setSlashMenuPosition] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  
  // Refs for event handlers to avoid closures
  const initYjsResultRef = useRef(null);
  const slashMenuOpenRef = useRef(false);
  const focusedIndexRef = useRef(0);
  const slashMenuIndexRef = useRef(null);
  const chatEndRef = useRef();
  const saveNamedVersionRef = useRef();

  // Track slash menu changes in refs
  slashMenuOpenRef.current = slashMenuPosition !== null;
  focusedIndexRef.current = focusedIndex;

  // Dynamic Read-Only Evaluation: Owner can always edit unless forcedReadOnly
  const isEditable = !forcedReadOnly && (!isRoomLocked || isOwner) && !isPersonallyBlocked;
  const isReadOnly = !isEditable;

  const getThemeStyles = () => {
    switch (currentTheme) {
      case 'netflix':
        return {
          bg: 'bg-zinc-950 font-sans text-white',
          panel: 'bg-zinc-900 border border-red-600/35 text-white shadow-[0_0_20px_rgba(229,9,20,0.15)]',
          header: 'bg-black border-b border-red-600/40 text-white',
          editorCard: 'bg-zinc-900/80 border border-zinc-800 rounded-xl shadow-2xl',
          badge: 'bg-red-600/25 text-red-500 border border-red-600/40',
          editorText: '#ffffff',
          placeholder: 'text-zinc-600',
          buttonPrimary: 'bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-[0_0_10px_rgba(229,9,20,0.3)]',
          buttonSecondary: 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white'
        };
      case 'spotify':
        return {
          bg: 'bg-[#121212] font-sans text-white',
          panel: 'bg-[#181818] border border-[#1db954]/25 text-white shadow-xl',
          header: 'bg-black border-b border-zinc-905 text-white',
          editorCard: 'bg-[#181818]/90 border border-zinc-800 rounded-xl shadow-2xl',
          badge: 'bg-[#1db954]/20 text-[#1db954] border border-[#1db954]/30',
          editorText: '#ffffff',
          placeholder: 'text-zinc-500',
          buttonPrimary: 'bg-[#1db954] hover:bg-[#1ed760] text-black font-extrabold transition-all shadow-[0_0_10px_rgba(29,185,84,0.3)]',
          buttonSecondary: 'bg-[#282828] hover:bg-[#3e3e3e] text-white border-0'
        };
      case 'sunset':
        return {
          bg: 'bg-gradient-to-br from-amber-600 via-rose-700 to-indigo-950 text-white',
          panel: 'bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl',
          header: 'bg-black/30 backdrop-blur-md border-b border-white/20 text-white',
          editorCard: 'bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white shadow-2xl',
          badge: 'bg-rose-500/25 text-rose-300 border border-rose-500/35',
          editorText: '#ffffff',
          placeholder: 'text-white/40',
          buttonPrimary: 'bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-bold',
          buttonSecondary: 'bg-white/10 border border-white/25 hover:bg-white/20 text-white'
        };
      case 'cyberpunk':
        return {
          bg: 'bg-zinc-950 font-mono text-cyan-400',
          panel: 'bg-black border-2 border-pink-500 text-cyan-400 shadow-[0_0_15px_rgba(236,72,153,0.3)]',
          header: 'bg-black border-b-2 border-pink-500 text-cyan-400',
          editorCard: 'bg-black border-2 border-cyan-400 rounded-none shadow-[0_0_20px_rgba(34,211,238,0.2)]',
          badge: 'bg-pink-500/20 text-pink-400 border border-pink-500/40',
          editorText: '#10b981',
          placeholder: 'text-cyan-600/50',
          buttonPrimary: 'bg-pink-600 hover:bg-pink-700 text-white font-mono',
          buttonSecondary: 'bg-black border border-cyan-400 hover:bg-cyan-950 text-cyan-400'
        };
      case 'dark':
        return {
          bg: 'bg-zinc-900 text-zinc-100',
          panel: 'bg-zinc-950 border border-zinc-800 text-zinc-100 shadow-md',
          header: 'bg-zinc-950 border-b border-zinc-800 text-zinc-100',
          editorCard: 'bg-zinc-950 border border-zinc-800 rounded-xl shadow-lg',
          badge: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
          editorText: '#f4f4f5',
          placeholder: 'text-zinc-600',
          buttonPrimary: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-950',
          buttonSecondary: 'bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-100'
        };
      case 'sepia':
        return {
          bg: 'bg-[#e6dcc4] text-amber-950',
          panel: 'bg-[#f4ebd0] border border-amber-900/30 text-amber-950 shadow-md',
          header: 'bg-[#f4ebd0] border-b border-amber-900/30 text-amber-950',
          editorCard: 'bg-[#f4ebd0] border border-amber-900/20 rounded-xl shadow-sm',
          badge: 'bg-amber-900/10 text-amber-900 border border-amber-900/20',
          editorText: '#451a03',
          placeholder: 'text-amber-900/40',
          buttonPrimary: 'bg-amber-900 hover:bg-amber-950 text-[#f4ebd0]',
          buttonSecondary: 'bg-[#f4ebd0] border border-amber-900/30 hover:bg-[#ebdcb9] text-amber-950'
        };
      case 'glass':
      default:
        return {
          bg: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 text-white',
          panel: 'bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl',
          header: 'bg-black/30 backdrop-blur-md border-b border-white/20 text-white',
          editorCard: 'bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white shadow-2xl',
          badge: 'bg-white/20 text-white border border-white/30',
          editorText: '#ffffff',
          placeholder: 'text-white/40',
          buttonPrimary: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white',
          buttonSecondary: 'bg-white/10 border border-white/20 hover:bg-white/20 text-white'
        };
    }
  };

  const theme = getThemeStyles();

  // Unified export handler
  const handleExportOption = (e) => {
    const opt = e.target.value;
    if (opt === 'pdf') exportDocumentFile();
    else if (opt === 'word' || opt === 'gdoc') exportDocumentWord();
    e.target.value = '';
  };

  // Export editor state locally as a PDF file
  const exportDocumentFile = async () => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    setSaveStatus('Exporting PDF...');
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
      
      const element = quill.root;
      const opt = {
        margin: 0.5,
        filename: `penpals-document-${roomId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      const pdfWorker = window.html2pdf().from(element).set(opt);
      
      if (window.showSaveFilePicker) {
        try {
          // Native Save As Flow
          const pdfBlob = await pdfWorker.output('blob');
          const handle = await window.showSaveFilePicker({
            suggestedName: `penpals-document-${roomId}.pdf`,
            types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
          toast.success('PDF document saved successfully!');
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        await pdfWorker.save();
        toast.success('PDF document exported successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF.');
    } finally {
      setSaveStatus('Saved');
    }
  };

  // Export editor state locally as a Word file
  const exportDocumentWord = async () => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    setSaveStatus('Exporting Word...');
    try {
      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Export</title></head>
        <body>${quill.root.innerHTML}</body>
        </html>
      `;
      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: `penpals-document-${roomId}.doc`,
            types: [{ description: 'Word Document', accept: { 'application/msword': ['.doc', '.docx'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success('Word document saved successfully!');
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        // Fallback standard download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `penpals-document-${roomId}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Word document exported successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Word document.');
    } finally {
      setSaveStatus('Saved');
    }
  };

  // Import local PDF/Word file and convert text content back into editor
  const importDocumentFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSaveStatus('Importing Document...');
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const typedarray = new Uint8Array(event.target.result);
            const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
            
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              
              let lastY = null;
              let pageText = '';
              for (const item of textContent.items) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                  pageText += '\n';
                }
                pageText += item.str + ' ';
                lastY = item.transform[5];
              }
              fullText += pageText + '\n\n';
            }

            const quill = quillRef.current?.getEditor();
            if (quill) {
              quill.setText(fullText.trim());
              toast.success('PDF imported and text reconstructed!');
            }
          } catch (err) {
            console.error(err);
            toast.error('Failed to parse PDF contents.');
          } finally {
            setSaveStatus('Saved');
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error(err);
        setSaveStatus('Saved');
        toast.error('Could not load PDF importer.');
      }
    } else if (ext === 'doc' || ext === 'docx') {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js');
        const reader = new FileReader();
        reader.onload = async (event) => {
          const arrayBuffer = event.target.result;
          try {
            const result = await window.mammoth.extractRawText({ arrayBuffer });
            const quill = quillRef.current?.getEditor();
            if (quill) {
              quill.setText(result.value.trim());
              toast.success('Word document imported!');
            }
          } catch(err) {
            console.error(err);
            toast.error('Failed to parse Word document.');
          } finally {
            setSaveStatus('Saved');
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error(err);
        setSaveStatus('Saved');
        toast.error('Could not load Word importer.');
      }
    } else {
      toast.error('File format not supported.');
      setSaveStatus('Saved');
    }
    
    e.target.value = '';
  };

  // Fetch Version History List
  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/rooms/${roomId}/versions`);
      const data = await res.json();
      setVersionHistoryList(data);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  }, [roomId]);

  // Save named snapshot of Yjs state
  const saveNamedVersion = async (customName = null) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const { ydoc } = initYjsResultRef.current || {};
    if (!ydoc) return;

    const stateUpdate = Y.encodeStateAsUpdate(ydoc);
    const base64Update = btoa(String.fromCharCode(...stateUpdate));
    
    const nextSaveNumber = versionHistoryList.length + 1;
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const name = customName || `Save #${nextSaveNumber} (${timeString})`;

    setSaveStatus('Saving Backup...');
    try {
      const res = await fetch(`http://localhost:4000/api/rooms/${roomId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ydocState: base64Update })
      });
      if (res.ok) {
        toast.success('Saved');
        fetchVersions();
      }
    } catch (err) {
      console.error('Failed to save version:', err);
      toast.error('Failed to save version.');
    } finally {
      setSaveStatus('Saved');
    }
  };

  const saveVersion = () => {
    const name = versionNameInput.trim();
    saveNamedVersion(name || null);
    setVersionNameInput('');
  };

  const deleteVersion = async (version) => {
    const versionId = version._id || new Date(version.timestamp).getTime().toString();
    try {
      const res = await fetch(`http://localhost:4000/api/rooms/${roomId}/versions/${versionId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Backup deleted');
        fetchVersions();
      }
    } catch (err) {
      console.error('Failed to delete version:', err);
      toast.error('Failed to delete backup.');
    }
  };

  const renameVersion = async (version) => {
    if (!editingVersionName.trim()) return;
    const versionId = version._id || new Date(version.timestamp).getTime().toString();
    try {
      const res = await fetch(`http://localhost:4000/api/rooms/${roomId}/versions/${versionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingVersionName.trim() })
      });
      if (res.ok) {
        toast.success('Backup renamed');
        setEditingVersionId(null);
        setEditingVersionName('');
        fetchVersions();
      }
    } catch (err) {
      console.error('Failed to rename version:', err);
      toast.error('Failed to rename backup.');
    }
  };

  saveNamedVersionRef.current = saveNamedVersion;

  // Restore document contents from a past version
  const restoreVersion = (version) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    try {
      const binary = Uint8Array.from(atob(version.ydocState), c => c.charCodeAt(0));
      const tempDoc = new Y.Doc();
      Y.applyUpdate(tempDoc, binary);
      
      const delta = tempDoc.getText('quill').toDelta();
      quill.setContents(delta);
      
      toast.success(`Restored to: ${version.name}`);
      setHistoryOpen(false);
    } catch (err) {
      console.error('Failed to restore version:', err);
      toast.error('Failed to restore version.');
    }
  };

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('send-chat-message', chatInput.trim());
    setChatInput('');
  };

  const toggleReadOnly = () => {
    if (forcedReadOnly || !socketRef.current || !isOwner) return;
    socketRef.current.emit('toggle-readonly', !isRoomLocked);
  };

  const toggleUserBlock = (targetSocketId, currentBlockStatus) => {
    if (!isOwner || !socketRef.current) return;
    socketRef.current.emit('toggle-user-block', {
      targetSocketId,
      blockStatus: !currentBlockStatus
    });
  };

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/?room=${roomId}&readOnly=true`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast.success('View-Only link copied!'))
      .catch(() => toast.error('Failed to copy.'));
  };

  const closeSlashMenu = useCallback(() => {
    setSlashMenuPosition(null);
    slashMenuIndexRef.current = null;
    slashMenuOpenRef.current = false;
    setFocusedIndex(0);
    focusedIndexRef.current = 0;
  }, []);

  const applyCommand = useCallback((cmd) => {
    const quill = quillRef.current?.getEditor();
    const menuIndex = slashMenuIndexRef.current;
    if (!quill || menuIndex === null) return;

    quill.deleteText(menuIndex, 1);
    quill.formatLine(menuIndex, 1, cmd.format, cmd.value);
    quill.setSelection(menuIndex);
    quill.focus();
    closeSlashMenu();
  }, [closeSlashMenu]);

  const triggerSaveStatus = useCallback(() => {
    setSaveStatus('Saving...');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('Saved');
    }, 1000);
  }, []);

  const updateFormattingInspector = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const range = quill.getSelection();
    if (range) {
      const formats = quill.getFormat(range.index, range.length);
      const active = [];
      if (formats.bold) active.push('Bold');
      if (formats.italic) active.push('Italic');
      if (formats.underline) active.push('Underline');
      if (formats.strike) active.push('Strikethrough');
      if (formats.header) active.push(`H${formats.header}`);
      if (formats.list === 'bullet') active.push('Bullet List');
      if (formats.list === 'ordered') active.push('Numbered List');
      if (formats.code || formats['code-block']) active.push('Code Block');
      if (formats.blockquote) active.push('Quote');
      if (formats.link) active.push('Link');
      if (formats.font) active.push(formats.font.toUpperCase());
      if (formats.size) active.push(formats.size);
      
      setActiveFormats(active);
    } else {
      setActiveFormats([]);
    }
  }, []);

  const handleCursorMove = useCallback(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill || !socketRef.current) return;

    const range = quill.getSelection();
    if (range) {
      try {
        const cursorBounds = quill.getBounds(range.index);
        if (cursorBounds) {
          socketRef.current.emit('cursor-update', {
            roomId,
            position: range.index,
            x: cursorBounds.left,
            y: cursorBounds.top
          });
        }
      } catch (err) {
        console.error('Error getting cursor bounds:', err);
      }
    }
  }, [roomId]);

  // Insert Image via custom url
  const handleInsertImage = () => {
    const quill = quillRef.current?.getEditor();
    const range = quill.getSelection(true);
    if (quill && range && imageUrl.trim()) {
      quill.insertEmbed(range.index, 'image', imageUrl.trim());
      quill.setSelection(range.index + 1);
      setImageUrl('');
      setImageModalOpen(false);
      toast.success('Image inserted');
    }
  };

  // Upload image from user device (Base64 embed)
  const handleLocalImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target.result;
      const quill = quillRef.current?.getEditor();
      const range = quill.getSelection(true);
      if (quill && range) {
        quill.insertEmbed(range.index, 'image', base64Url);
        quill.setSelection(range.index + 1);
        setImageModalOpen(false);
        toast.success('Local image uploaded and inserted!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Insert custom link with label/overwritten text
  const handleInsertLink = () => {
    const quill = quillRef.current?.getEditor();
    const range = quill.getSelection(true);
    if (quill && range && linkUrl.trim()) {
      const labelText = linkText.trim() || linkUrl.trim();
      quill.insertText(range.index, labelText, 'link', linkUrl.trim());
      quill.setSelection(range.index + labelText.length);
      setLinkUrl('');
      setLinkText('');
      setLinkModalOpen(false);
      toast.success('Link inserted');
    }
  };

  // Handle live resizing and repositioning bounds of Selected Element (Image Resize overlay)
  useEffect(() => {
    if (!selectedElement || !editorContainer) {
      setOverlayRect(null);
      return;
    }

    const updateRect = () => {
      const rect = selectedElement.getBoundingClientRect();
      const parentRect = editorContainer.getBoundingClientRect();
      setOverlayRect({
        left: rect.left - parentRect.left + editorContainer.scrollLeft,
        top: rect.top - parentRect.top + editorContainer.scrollTop,
        width: rect.width,
        height: rect.height
      });
    };

    updateRect();
    
    const observer = new MutationObserver(updateRect);
    observer.observe(selectedElement, { attributes: true, childList: true, characterData: true });

    editorContainer.addEventListener('scroll', updateRect);
    window.addEventListener('resize', updateRect);
    return () => {
      observer.disconnect();
      editorContainer.removeEventListener('scroll', updateRect);
      window.removeEventListener('resize', updateRect);
    };
  }, [selectedElement, editorContainer]);

  // Handle overlay resizing drag
  const handleOverlayDrag = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();

    const startWidth = overlayRect.width;
    const startHeight = overlayRect.height;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction.includes('e')) newWidth = Math.max(40, startWidth + deltaX);
      if (direction.includes('s')) newHeight = Math.max(40, startHeight + deltaY);
      if (direction.includes('w')) newWidth = Math.max(40, startWidth - deltaX);
      if (direction.includes('n')) newHeight = Math.max(40, startHeight - deltaY);

      selectedElement.style.width = `${newWidth}px`;
      selectedElement.style.height = `${newHeight}px`;

      const quill = quillRef.current?.getEditor();
      quill?.update();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const quill = quillRef.current?.getEditor();
      quill?.update();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    const quill = quillRef.current?.getEditor();
    if (quill) {
      const blot = Quill.find(selectedElement);
      if (blot) {
        blot.remove();
        setSelectedElement(null);
        quill.update();
      }
    }
  };

  useEffect(() => {
    if (!roomId) return;

    // Initialize Socket.io
    socketRef.current = io('http://localhost:4000');
    
    socketRef.current.emit('join-room', {
      roomId,
      username: initialUsername,
      color: initialColor
    });

    socketRef.current.on('room-users', (usersList) => {
      setUsers(usersList);
    });

    socketRef.current.on('room-chat-history', (history) => {
      setChatMessages(history);
    });

    socketRef.current.on('chat-message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
      if (chatOpen) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    socketRef.current.on('readonly-state', (lockedState) => {
      setIsRoomLocked(lockedState);
    });

    socketRef.current.on('readonly-toggled', (lockedState) => {
      setIsRoomLocked(lockedState);
      toast(lockedState ? '🔒 Document editing locked by room owner' : '🔓 Document unlocked by room owner');
    });

    socketRef.current.on('blocked-users-list', (blockedList) => {
      setBlockedUsers(blockedList);
      const myId = socketRef.current?.id;
      if (myId && blockedList.includes(myId)) {
        setIsPersonallyBlocked(true);
      } else {
        setIsPersonallyBlocked(false);
      }
    });

    socketRef.current.on('owner-status', (status) => {
      setIsOwner(status);
      // Suppress owner toast alert
    });

    socketRef.current.on('user-joined', (user) => {
      toast(`${user.userId} joined the room`);
      setUsers(prev => {
        if (prev.some(u => u.socketId === user.socketId)) return prev;
        return [...prev, user];
      });
    });

    socketRef.current.on('user-left', (user) => {
      toast(`${user.userId || 'A collaborator'} left the room`);
      setUsers(prev => prev.filter(u => u.socketId !== user.socketId));
      setCursors(prev => prev.filter(c => c.socketId !== user.socketId));
    });

    socketRef.current.on('cursor-moved', (cursorData) => {
      setCursors(prev => {
        const updated = prev.filter(c => c.socketId !== cursorData.socketId);
        return [...updated, { socketId: cursorData.socketId, ...cursorData }];
      });
    });

    // Initialize Yjs
    initYjsResultRef.current = initYjs(roomId, quillRef);

    const quill = quillRef.current.getEditor();
    setEditorContainer(quill.container);

    // Initial load
    fetchVersions();

    // Attach native hover tooltips to toolbar
    const attachTooltips = () => {
      const toolbar = document.querySelector('.ql-toolbar');
      if (!toolbar) return;

      const tooltipMapping = {
        '.ql-bold': 'Bold (Ctrl+B)',
        '.ql-italic': 'Italic (Ctrl+I)',
        '.ql-underline': 'Underline (Ctrl+U)',
        '.ql-strike': 'Strikethrough',
        '.ql-blockquote': 'Blockquote',
        '.ql-code-block': 'Code Block',
        '.ql-link': 'Insert Custom Labeled Link (🔗)',
        '.ql-image': 'Insert Image URL / Device File (🖼️)',
        '.ql-clean': 'Clear Formatting',
        '.ql-list[value="ordered"]': 'Numbered List',
        '.ql-list[value="bullet"]': 'Bullet List',
        '.ql-font': 'Font Family',
        '.ql-size': 'Text Size',
        '.ql-color': 'Text Color',
        '.ql-background': 'Text Background Color'
      };

      Object.entries(tooltipMapping).forEach(([selector, tooltip]) => {
        const button = toolbar.querySelector(selector);
        if (button) {
          button.setAttribute('title', tooltip);
        }
      });
    };

    setTimeout(attachTooltips, 600);

    // Editor Event Listeners
    const onTextChange = (delta, oldDelta, source) => {
      triggerSaveStatus();
      updateFormattingInspector();
      handleCursorMove();

      if (source === 'user') {
        const range = quill.getSelection();
        if (range) {
          const textBefore = quill.getText(range.index - 1, 1);
          if (textBefore === '/') {
            const bounds = quill.getBounds(range.index - 1);
            setSlashMenuPosition({ x: bounds.left, y: bounds.top + bounds.height });
            slashMenuIndexRef.current = range.index - 1;
            setFocusedIndex(0);
          } else {
            setSlashMenuPosition(null);
          }
        }
      }
    };

    const handleEditorClick = (e) => {
      const imgEl = e.target.closest('img');

      if (imgEl) {
        setSelectedElement(imgEl);
      } else if (!e.target.closest('.element-resizer-overlay') && !e.target.closest('.customizer-floating-panel')) {
        setSelectedElement(null);
      }
    };

    quill.on('selection-change', () => {
      handleCursorMove();
      updateFormattingInspector();
    });
    quill.on('text-change', onTextChange);
    quill.root.addEventListener('click', handleEditorClick);

    // Keyboard capture for Slash commands and shortcuts
    const handleKeyDown = (e) => {
      // Ctrl + S / Cmd + S for manual saves
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNamedVersionRef.current?.();
        return;
      }

      if (!slashMenuOpenRef.current) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (focusedIndexRef.current + 1) % COMMANDS.length;
        setFocusedIndex(nextIdx);
        focusedIndexRef.current = nextIdx;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (focusedIndexRef.current - 1 + COMMANDS.length) % COMMANDS.length;
        setFocusedIndex(prevIdx);
        focusedIndexRef.current = prevIdx;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        applyCommand(COMMANDS[focusedIndexRef.current]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSlashMenu();
      }
    };

    quill.root.addEventListener('keydown', handleKeyDown, true);

    return () => {
      socketRef.current?.disconnect();
      destroyYjs();
      if (quill) {
        quill.root.removeEventListener('keydown', handleKeyDown, true);
        quill.root.removeEventListener('click', handleEditorClick);
      }
    };
  }, [roomId, initialUsername, initialColor, forcedReadOnly, chatOpen, triggerSaveStatus, updateFormattingInspector, handleCursorMove, applyCommand, closeSlashMenu, fetchVersions]);

  // Handle beforeunload to warn users about leaving
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Handle auto-scroll for chat
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  // Quill configuration modules
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ font: [false, 'serif', 'monospace', 'calibri', 'arial', 'arial-narrow', 'georgia', 'impact'] }],
        [{ size: ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: {
        link: () => {
          setLinkModalOpen(true);
        },
        image: () => {
          setImageModalOpen(true);
        }
      }
    }
  }), []);

  return (
    <div className={`h-screen flex flex-col transition-all duration-300 ${theme.bg}`}>
      
      {/* CSS Overrides for Quill Theme Styling */}
      <style>{`
        .ql-editor {
          color: ${theme.editorText} !important;
          font-family: ${currentTheme === 'cyberpunk' ? 'monospace' : 'inherit'} !important;
          font-size: 16px;
        }
        .ql-editor.ql-blank::before {
          color: ${currentTheme === 'glass' || currentTheme === 'sunset' ? 'rgba(255,255,255,0.4)' : currentTheme === 'cyberpunk' ? 'rgba(34,211,238,0.4)' : currentTheme === 'sepia' ? 'rgba(69,26,3,0.4)' : 'rgba(244,244,245,0.4)'} !important;
          font-family: ${currentTheme === 'cyberpunk' ? 'monospace' : 'inherit'} !important;
        }
        
        .ql-toolbar {
          position: relative !important;
          z-index: 150 !important;
          background-color: ${currentTheme === 'cyberpunk' ? '#000000' : currentTheme === 'dark' || currentTheme === 'netflix' ? '#09090b' : currentTheme === 'spotify' ? '#121212' : currentTheme === 'sepia' ? '#ebdcb9' : 'rgba(255,255,255,0.1)'} !important;
          border: none !important;
          border-bottom: 1px solid ${currentTheme === 'cyberpunk' ? '#ec4899' : currentTheme === 'dark' || currentTheme === 'netflix' ? '#27272a' : currentTheme === 'spotify' ? '#282828' : currentTheme === 'sepia' ? 'rgba(69,26,3,0.1)' : 'rgba(255,255,255,0.1)'} !important;
        }
        .ql-container {
          position: relative !important;
          z-index: 10 !important;
          border: none !important;
        }
        
        .ql-snow .ql-stroke {
          stroke: ${currentTheme === 'sepia' ? '#451a03' : '#ffffff'} !important;
        }
        .ql-snow .ql-fill {
          fill: ${currentTheme === 'sepia' ? '#451a03' : '#ffffff'} !important;
        }
        .ql-snow .ql-picker {
          color: ${currentTheme === 'sepia' ? '#451a03' : '#ffffff'} !important;
        }

        .ql-snow .ql-picker-options {
          background-color: ${currentTheme === 'cyberpunk' ? '#000000' : currentTheme === 'dark' || currentTheme === 'netflix' ? '#18181b' : currentTheme === 'spotify' ? '#181818' : currentTheme === 'sepia' ? '#ebdcb9' : '#1e1b4b'} !important;
          border: 1px solid ${currentTheme === 'cyberpunk' ? '#ec4899' : currentTheme === 'sepia' ? '#451a03' : 'rgba(255, 255, 255, 0.2)'} !important;
          box-shadow: 0 12px 20px -3px rgba(0, 0, 0, 0.5) !important;
          z-index: 1000 !important;
          padding: 8px !important;
          border-radius: 8px !important;
        }

        .ql-snow .ql-picker-options .ql-picker-item {
          color: ${currentTheme === 'sepia' ? '#451a03' : '#ffffff'} !important;
          padding: 6px 12px !important;
          border-radius: 4px !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
          display: block !important;
        }

        .ql-snow .ql-picker-options .ql-picker-item:hover,
        .ql-snow .ql-picker-options .ql-picker-item.ql-selected {
          background-color: rgba(255, 255, 255, 0.15) !important;
          color: #818cf8 !important;
          padding-left: 16px !important;
        }

        .ql-snow .ql-color-picker .ql-picker-options {
          width: 152px !important;
        }
        .ql-snow .ql-color-picker .ql-picker-options .ql-picker-item {
          width: 16px !important;
          height: 16px !important;
          padding: 0 !important;
          margin: 2px !important;
          border-radius: 3px !important;
          display: inline-block !important;
        }

        .ql-font-calibri {
          font-family: 'Calibri', sans-serif !important;
        }
        .ql-font-arial {
          font-family: 'Arial', sans-serif !important;
        }
        .ql-font-arial-narrow {
          font-family: 'Arial Narrow', sans-serif !important;
        }
        .ql-font-georgia {
          font-family: 'Georgia', serif !important;
        }
        .ql-font-impact {
          font-family: 'Impact', sans-serif !important;
        }

        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="calibri"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="calibri"]::before {
          content: 'Calibri' !important;
          font-family: 'Calibri', sans-serif;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial"]::before {
          content: 'Arial' !important;
          font-family: 'Arial', sans-serif;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="arial-narrow"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="arial-narrow"]::before {
          content: 'Arial Narrow' !important;
          font-family: 'Arial Narrow', sans-serif;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="georgia"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="georgia"]::before {
          content: 'Georgia' !important;
          font-family: 'Georgia', serif;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="impact"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="impact"]::before {
          content: 'Impact' !important;
          font-family: 'Impact', sans-serif;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item::before {
          content: 'Sans Serif' !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="serif"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="serif"]::before {
          content: 'Serif' !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="monospace"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="monospace"]::before {
          content: 'Monospace' !important;
        }

        .ql-size-10px { font-size: 10px !important; }
        .ql-size-12px { font-size: 12px !important; }
        .ql-size-14px { font-size: 14px !important; }
        .ql-size-16px { font-size: 16px !important; }
        .ql-size-18px { font-size: 18px !important; }
        .ql-size-20px { font-size: 20px !important; }
        .ql-size-24px { font-size: 24px !important; }
        .ql-size-32px { font-size: 32px !important; }

        .ql-snow .ql-picker.ql-size .ql-picker-label::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item::before {
          content: '14px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before {
          content: '10px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before {
          content: '12px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before {
          content: '14px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before {
          content: '16px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before {
          content: '18px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before {
          content: '20px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before {
          content: '24px' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="32px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="32px"]::before {
          content: '32px' !important;
        }
      `}</style>

      {/* Header */}
      <div className={`p-4 border-b transition-all duration-300 ${theme.header}`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="PenPals Logo" 
              className="w-16 h-auto object-contain" 
              style={{ filter: 'invert(1) hue-rotate(180deg) brightness(1.5)', mixBlendMode: 'screen' }}
            />
            
            {/* Copy Room ID Button */}
            <div className="flex items-center gap-1.5 bg-black/45 border border-white/15 px-2.5 py-1 rounded-md text-xs">
              <span className="opacity-60">ID:</span>
              <span className="font-mono font-semibold">{roomId}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  toast.success('Room ID copied!');
                }}
                className="hover:text-indigo-400 ml-1 transition-colors text-sm"
                title="Copy Room ID"
              >
                📋
              </button>
            </div>

            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${theme.badge}`}>
              {saveStatus}
            </span>

            <button
              onClick={() => saveNamedVersion()}
              className="px-2.5 py-1 bg-indigo-600/35 hover:bg-indigo-600 border border-indigo-500/40 hover:border-indigo-400 rounded-md text-xs font-bold transition-all text-white flex items-center gap-1 active:scale-95"
              title="Save a snapshot of this document (Ctrl + S)"
            >
              💾
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs opacity-75">Theme:</span>
            <select
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value)}
              className="px-2.5 py-1 text-xs bg-black/40 border border-white/20 rounded-md focus:outline-none focus:ring-1 focus:ring-white/40 text-white"
            >
              <option value="glass" className="text-black">Glassmorphism</option>
              <option value="netflix" className="text-black">Netflix Dark</option>
              <option value="spotify" className="text-black">Spotify Retro</option>
              <option value="sunset" className="text-black">Sunset Glow</option>
              <option value="cyberpunk" className="text-black">Cyberpunk</option>
              <option value="dark" className="text-black">Sleek Dark</option>
              <option value="sepia" className="text-black">Cozy Sepia</option>
            </select>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Unified Export Menu */}
            <select
              onChange={handleExportOption}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${theme.buttonSecondary}`}
              title="Export Document"
              defaultValue=""
            >
              <option value="" disabled hidden>📤 Export</option>
              <option value="pdf" className="text-black">PDF (.pdf)</option>
              <option value="word" className="text-black">Word (.doc)</option>
              <option value="gdoc" className="text-black">Google Docs (.docx)</option>
            </select>

            <div className="relative">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={importDocumentFile}
                className="hidden"
                id="document-file-import"
              />
              <label
                htmlFor="document-file-import"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${theme.buttonSecondary}`}
                title="Import"
              >
                📥
              </label>
            </div>


            {/* Sidebar Triggers */}
            <button
              onClick={() => { setChatOpen(prev => !prev); setHistoryOpen(false); setCollaboratorsOpen(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold relative ${theme.buttonSecondary}`}
              title="Room Chat"
            >
              💬
              {chatMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => { setHistoryOpen(prev => !prev); setChatOpen(false); setCollaboratorsOpen(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.buttonSecondary}`}
              title="Version History"
            >
              ⏳
            </button>

            <button
              onClick={() => { setCollaboratorsOpen(prev => !prev); setChatOpen(false); setHistoryOpen(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.buttonSecondary}`}
              title="Room Users"
            >
              👥 ({users.length})
            </button>
          </div>
        </div>
      </div>

      {/* Access Denied Banner */}
      {isReadOnly && (
        <div className="bg-rose-500/20 border-b border-rose-500/30 px-4 py-2 text-center text-xs font-semibold text-rose-400">
          {isPersonallyBlocked 
            ? '🚫 You have been personally blocked from editing this room by the owner.' 
            : '🔒 Editing locked. Only the room owner is allowed to edit.'}
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Editor Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden max-w-7xl mx-auto w-full relative">
          <div className={`flex-1 flex flex-col rounded-xl overflow-hidden shadow-2xl relative transition-all duration-300 ${theme.editorCard}`}>
            
            <ReactQuill
              ref={quillRef}
              theme="snow"
              modules={modules}
              readOnly={isReadOnly}
              className="flex-1 overflow-y-auto"
              placeholder="Start typing collaborative document... (Type '/' for formatting shortcuts)"
            />

            {/* Formatting Inspector Status Bar */}
            <div className="p-2 border-t border-white/5 flex items-center justify-between text-xs opacity-75 select-none">
              <div>Room: {roomId} {isOwner ? '(Owner)' : ''}</div>
              <div className="flex items-center gap-1.5">
                <span className="opacity-50">Formats:</span>
                {activeFormats.length > 0 ? (
                  activeFormats.map(fmt => (
                    <span key={fmt} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${theme.badge}`}>
                      {fmt}
                    </span>
                  ))
                ) : (
                  <span className="italic opacity-50">None</span>
                )}
              </div>
            </div>

            {/* Cursor Overlay Portal */}
            {editorContainer && createPortal(
              <div className="absolute inset-0 pointer-events-none z-50">
                <AnimatePresence>
                  {cursors.map(cursor => (
                    <motion.div
                      key={cursor.socketId}
                      className="absolute w-[2px] h-5 rounded shadow-2xl"
                      style={{
                        left: cursor.x,
                        top: cursor.y + 4,
                        backgroundColor: cursor.color || '#3B82F6'
                      }}
                      initial={{ opacity: 0, scaleY: 0.5 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div 
                        className="absolute left-0 top-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-md pointer-events-none"
                        style={{ 
                          backgroundColor: cursor.color || '#3B82F6', 
                          transform: 'translateY(-100%)',
                          fontSize: '9px',
                          lineHeight: '1'
                        }}
                      >
                        {cursor.userId}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>,
              editorContainer
            )}

            {/* Slash Command Dropdown Menu Portal */}
            {slashMenuPosition && editorContainer && createPortal(
              <div 
                className="absolute z-[999] w-64 bg-zinc-950/95 border border-white/20 rounded-xl shadow-2xl py-1.5 text-white backdrop-blur-md"
                style={{
                  left: slashMenuPosition.x,
                  top: slashMenuPosition.y + 8,
                }}
              >
                <div className="px-3 py-1.5 text-[10px] font-extrabold text-white/45 tracking-widest uppercase">
                  Commands
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {COMMANDS.map((cmd, idx) => (
                    <button
                      key={cmd.id}
                      onClick={() => applyCommand(cmd)}
                      className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-all ${
                        focusedIndex === idx ? 'bg-indigo-600 text-white' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-bold text-xs">
                        {cmd.icon}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{cmd.name}</div>
                        <div className="text-[10px] opacity-65">{cmd.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>,
              editorContainer
            )}

            {/* Interactive Selection Resize and Formatting Overlay Portal */}
            {overlayRect && selectedElement && editorContainer && createPortal(
              <div 
                className="absolute border-2 border-indigo-500 pointer-events-none z-[800] element-resizer-overlay"
                style={{
                  left: overlayRect.left,
                  top: overlayRect.top,
                  width: overlayRect.width,
                  height: overlayRect.height
                }}
              >
                <div 
                  onMouseDown={(e) => handleOverlayDrag(e, 'se')}
                  className="absolute w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full -bottom-1.5 -right-1.5 cursor-se-resize pointer-events-auto shadow-md hover:scale-125 transition-transform" 
                />
                <div 
                  onMouseDown={(e) => handleOverlayDrag(e, 'sw')}
                  className="absolute w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full -bottom-1.5 -left-1.5 cursor-sw-resize pointer-events-auto shadow-md hover:scale-125 transition-transform" 
                />
                <div 
                  onMouseDown={(e) => handleOverlayDrag(e, 'ne')}
                  className="absolute w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full -top-1.5 -right-1.5 cursor-ne-resize pointer-events-auto shadow-md hover:scale-125 transition-transform" 
                />
                <div 
                  onMouseDown={(e) => handleOverlayDrag(e, 'nw')}
                  className="absolute w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full -top-1.5 -left-1.5 cursor-nw-resize pointer-events-auto shadow-md hover:scale-125 transition-transform" 
                />

                {/* Floating On-Screen Customizer Toolbar */}
                <div 
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-zinc-950/90 border border-white/20 px-3 py-2 rounded-xl flex items-center gap-3.5 pointer-events-auto shadow-2xl backdrop-blur-md customizer-floating-panel text-white text-[10px]"
                  style={{ minWidth: 'max-content' }}
                >
                  <button
                    onClick={deleteSelectedElement}
                    className="p-1.5 hover:bg-red-500/20 text-rose-400 hover:text-rose-300 rounded-lg transition-colors text-xs font-bold"
                    title="Delete Element"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>,
              editorContainer
            )}

          </div>
        </div>

        {/* Sidebar chat drawer */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ x: 350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 350, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`w-80 h-full border-l flex flex-col overflow-hidden z-20 absolute right-0 top-0 ${theme.panel}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-sm">💬 Room Chat</h3>
                <button onClick={() => setChatOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs opacity-50 italic">
                    No messages in this room yet.
                  </div>
                ) : (
                  chatMessages.map((msg, index) => (
                    <div key={index} className="text-xs space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="font-bold px-1.5 py-0.5 rounded text-[9px] text-white"
                          style={{ backgroundColor: msg.color }}
                        >
                          {msg.userId}
                        </span>
                        <span className="opacity-40 text-[9px]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg break-words leading-relaxed border border-white/5">
                        {msg.message}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendChatMessage} className="p-3 border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type message..."
                  className="flex-1 px-3 py-2 text-xs bg-black/40 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/40 text-white"
                />
                <button 
                  type="submit"
                  className={`px-3 py-2 rounded-lg text-xs font-bold ${theme.buttonPrimary}`}
                >
                  Send
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar version history drawer */}
        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ x: 350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 350, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`w-80 h-full border-l flex flex-col overflow-hidden z-20 absolute right-0 top-0 ${theme.panel}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-sm">⏳ Version history</h3>
                <button onClick={() => setHistoryOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
              </div>

              <div className="p-4 border-b border-white/10 space-y-3">
                <label className="text-xs font-semibold block opacity-75">Create snapshot</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={versionNameInput}
                    onChange={(e) => setVersionNameInput(e.target.value)}
                    placeholder="E.g. Draft 1..."
                    className="flex-1 px-3 py-2 text-xs bg-black/40 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/40 text-white"
                  />
                  <button
                    onClick={saveVersion}
                    className={`px-3 py-2 rounded-lg text-xs font-bold ${theme.buttonPrimary}`}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <label className="text-xs font-semibold block opacity-75 mb-1">Saved backups</label>
                {versionHistoryList.length === 0 ? (
                  <div className="text-xs opacity-50 italic pt-2">No backups saved yet.</div>
                ) : (
                  versionHistoryList.map((ver) => {
                    const isVerId = ver._id || new Date(ver.timestamp).getTime().toString();
                    const isEditing = editingVersionId === isVerId;

                    return (
                      <div 
                        key={isVerId} 
                        className="p-3 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl flex flex-col gap-2 transition-all"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editingVersionName}
                              onChange={(e) => setEditingVersionName(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-black/40 border border-white/25 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white font-medium"
                              placeholder="New backup name..."
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => renameVersion(ver)}
                                className="px-2.5 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-all"
                                title="Save name change"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingVersionId(null)}
                                className="px-2.5 py-1 text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-all"
                                title="Cancel"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col">
                              <span className="font-semibold text-xs truncate">{ver.name}</span>
                              <span className="text-[10px] opacity-50">
                                {new Date(ver.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => restoreVersion(ver)}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded ${theme.buttonSecondary}`}
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => {
                                  setEditingVersionId(isVerId);
                                  setEditingVersionName(ver.name);
                                }}
                                className={`px-2 py-1.5 text-[10px] font-bold rounded transition-all ${theme.buttonSecondary}`}
                                title="Rename snapshot"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteVersion(ver)}
                                className="px-2 py-1.5 text-[10px] font-bold bg-rose-950/50 hover:bg-rose-900/80 border border-rose-500/30 text-rose-300 rounded transition-all"
                                title="Delete this snapshot"
                              >
                                🗑️
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar collaborators drawer */}
        <AnimatePresence>
          {collaboratorsOpen && (
            <motion.div
              initial={{ x: 350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 350, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`w-80 h-full border-l flex flex-col overflow-hidden z-20 absolute right-0 top-0 ${theme.panel}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-sm">👥 Collaborators</h3>
                <button onClick={() => setCollaboratorsOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
              </div>

              {isOwner && (
                <div className="p-4 border-b border-white/10 space-y-2.5">
                  <label className="text-[10px] font-extrabold uppercase text-white/50 tracking-wider">Global Action</label>
                  <button
                    onClick={toggleReadOnly}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                      isRoomLocked ? 'bg-rose-600 hover:bg-rose-700 text-white' : theme.buttonSecondary
                    }`}
                  >
                    {isRoomLocked ? '🔓 Allow Everyone to Edit' : '🔒 Stop Everyone Editing'}
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <label className="text-[10px] font-extrabold uppercase text-white/50 tracking-wider">Active in Room</label>
                {users.length === 0 ? (
                  <div className="text-xs opacity-50 italic">No one else in the room.</div>
                ) : (
                  users.map((u) => {
                    const isSelf = u.socketId === socketRef.current?.id;
                    const isBlocked = blockedUsers.includes(u.socketId);
                    
                    return (
                      <div 
                        key={u.socketId}
                        className="p-3 bg-white/5 border border-white/5 rounded-xl flex flex-col gap-2 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: u.color }}
                            />
                            <span className="font-semibold text-xs truncate">
                              {u.userId} {isSelf ? ' (You)' : ''}
                            </span>
                          </div>
                          {isSelf && <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">You</span>}
                        </div>
                        
                        {/* Block/Unblock toggle */}
                        {isOwner && !isSelf ? (
                          <button
                            onClick={() => toggleUserBlock(u.socketId, isBlocked)}
                            className={`w-full py-1.5 text-[10px] font-bold rounded transition-all ${
                              isBlocked 
                                ? 'bg-rose-600/30 text-rose-300 hover:bg-rose-600/40 border border-rose-500/40' 
                                : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/35'
                            }`}
                          >
                            {isBlocked ? '🚫 Blocked (Click to Allow)' : '✅ Allowed (Click to Block)'}
                          </button>
                        ) : (
                          <span className="text-[10px] opacity-50 italic">
                            {isBlocked ? '🚫 Blocked' : '✅ Active'}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Image Insertion Modal */}
      <AnimatePresence>
        {imageModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border ${theme.panel}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h3 className="font-bold text-sm">🖼️ Insert Image</h3>
                <button onClick={() => setImageModalOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
              </div>
              <div className="p-6 space-y-4 text-xs">
                
                <div className="flex border-b border-white/10 bg-black/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setImageTab('upload')}
                    className={`flex-1 py-2 text-[10px] font-extrabold uppercase transition-all ${
                      imageTab === 'upload' ? 'bg-[#1db954] text-black font-extrabold' : 'opacity-60'
                    }`}
                  >
                    💻 Device Upload
                  </button>
                  <button
                    onClick={() => setImageTab('url')}
                    className={`flex-1 py-2 text-[10px] font-extrabold uppercase transition-all ${
                      imageTab === 'url' ? 'bg-[#1db954] text-black font-extrabold' : 'opacity-60'
                    }`}
                  >
                    🌐 Image URL
                  </button>
                </div>

                {imageTab === 'upload' && (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-white/15 hover:border-white/30 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLocalImageUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <span className="text-2xl mb-2">📁</span>
                      <span className="font-semibold block opacity-85">Click to choose image file</span>
                      <span className="text-[10px] opacity-45 mt-1">Supports PNG, JPG, GIF, WebP</span>
                    </div>
                  </div>
                )}

                {imageTab === 'url' && (
                  <div className="space-y-3">
                    <label className="block font-semibold opacity-85">Image Source URL</label>
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Enter image URL (e.g. https://example.com/image.png)..."
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                    />
                    <button
                      onClick={handleInsertImage}
                      disabled={!imageUrl.trim()}
                      className={`w-full py-2.5 rounded-lg font-bold transition-all disabled:opacity-40 ${theme.buttonPrimary}`}
                    >
                      Insert Image Block
                    </button>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Link Insertion Modal */}
      <AnimatePresence>
        {linkModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border ${theme.panel}`}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h3 className="font-bold text-sm">🔗 Insert Labeled Link</h3>
                <button onClick={() => setLinkModalOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
              </div>
              <div className="p-6 space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-semibold opacity-85">Link URL</label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Enter URL (e.g. https://google.com/search?q=penpals)..."
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-semibold opacity-85">Link Label Text (Short Override)</label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    placeholder="E.g. 'LINK' or 'Google'..."
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>
                <button
                  onClick={handleInsertLink}
                  disabled={!linkUrl.trim()}
                  className={`w-full py-2.5 rounded-lg font-bold transition-all disabled:opacity-40 ${theme.buttonPrimary}`}
                >
                  Insert Link
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Editor;