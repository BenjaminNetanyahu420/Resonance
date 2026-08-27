import { useCallback, useRef, useState } from 'react';
import type { ProjectState } from './types';

type ProjectUpdater = ProjectState | ((current: ProjectState) => ProjectState);

export function useProjectHistory(initial: ProjectState) {
  const [project, setProject] = useState(initial);
  const [revision, setRevision] = useState(0);
  const past = useRef<ProjectState[]>([]);
  const future = useRef<ProjectState[]>([]);
  const transaction = useRef({ key: '', time: 0 });

  const updateProject = useCallback((updater: ProjectUpdater, transactionKey = '') => {
    setProject((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (next === current) return current;
      const now = performance.now();
      const coalesced = transactionKey && transaction.current.key === transactionKey && now - transaction.current.time < 500;
      if (!coalesced) past.current.push(current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      transaction.current = { key: transactionKey, time: now };
      setRevision((value) => value + 1);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setProject((current) => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current.push(current);
      transaction.current.key = '';
      setRevision((value) => value + 1);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setProject((current) => {
      const next = future.current.pop();
      if (!next) return current;
      past.current.push(current);
      transaction.current.key = '';
      setRevision((value) => value + 1);
      return next;
    });
  }, []);

  return { project, updateProject, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0, revision };
}
