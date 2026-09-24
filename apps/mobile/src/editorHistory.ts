import { applyCommand, type Draft, type EditorCommand } from '@journalcollage/editor-core';

export const MAX_UNDO_STEPS = 50;
export type EditorState = Readonly<{ past: readonly Draft[]; present: Draft; future: readonly Draft[] }>;
export type EditorAction = Readonly<{ type: 'command'; command: EditorCommand }> | Readonly<{ type: 'undo' }> | Readonly<{ type: 'redo' }> | Readonly<{ type: 'hydrate'; draft: Draft }>;

export const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  if (action.type === 'hydrate') return { past: [], present: action.draft, future: [] };
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous === undefined ? state : { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future].slice(0, MAX_UNDO_STEPS) };
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next === undefined ? state : { past: [...state.past, state.present].slice(-MAX_UNDO_STEPS), present: next, future: state.future.slice(1) };
  }
  const result = applyCommand(state.present, action.command, new Date().toISOString());
  if (!result.changed) return state;
  if (action.command.type === 'layer.select') return { ...state, present: result.draft };
  return { past: [...state.past, state.present].slice(-MAX_UNDO_STEPS), present: result.draft, future: [] };
};
