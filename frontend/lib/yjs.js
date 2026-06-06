import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';

let ydoc = null;
let provider = null;
let quillBinding = null;

export const initYjs = (roomId, quillRef) => {
  ydoc = new Y.Doc();
  
  provider = new WebsocketProvider(
    `ws://localhost:4000`,
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