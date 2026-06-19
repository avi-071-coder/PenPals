import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';

let ydoc = null;
let provider = null;
let quillBinding = null;

export const initYjs = (roomId, quillRef) => {
  ydoc = new Y.Doc();
  
  const backendUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
  const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
  const wsHost = backendUrl.replace(/^https?:\/\//, '');
  const wsUrl = `${wsProtocol}://${wsHost}`;

  provider = new WebsocketProvider(
    wsUrl,
    roomId,
    ydoc
  );
  
  const quill = quillRef.current.getEditor();
  quillBinding = new QuillBinding(ydoc.getText('quill'), quill);

  return { ydoc, provider };
};

export const destroyYjs = () => {
  if (quillBinding) {
    quillBinding.destroy();
    quillBinding = null;
  }
  if (provider) {
    provider.destroy();
    provider = null;
  }
  if (ydoc) {
    ydoc.destroy();
    ydoc = null;
  }
};