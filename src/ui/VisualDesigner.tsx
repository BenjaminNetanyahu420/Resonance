import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SampledAudioFeatures } from '../audio/types';
import { createId, createLayer } from '../project/defaults';
import { getProjectNumber, PARAMETERS, setProjectNumber, type ParameterDefinition } from '../project/parameters';
import type {
  BlendMode, CompositionLayer, LayerType, ModulationSource, PerformanceMode, ProjectState, ShapeType,
} from '../project/types';
import { ColorControl, RangeControl, SelectControl, ToggleControl } from './Control';

type UpdateProject = (updater: ProjectState | ((current: ProjectState) => ProjectState), transactionKey?: string) => void;

interface Props {
  project: ProjectState;
  updateProject: UpdateProject;
  currentTime: number;
  duration: number;
  sampled: SampledAudioFeatures | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportProgress?: ReactNode;
}

const SOURCE_OPTIONS: readonly { value: ModulationSource; label: string }[] = [
  ['subBass', 'Sub bass'], ['bass', 'Bass'], ['lowMid', 'Low mids'], ['mid', 'Mids'], ['upperMid', 'Upper mids'],
  ['presence', 'Presence'], ['high', 'Treble'], ['rms', 'Overall RMS'], ['peak', 'Peak'], ['centroid', 'Spectral centroid'],
  ['flux', 'Spectral flux'], ['beatPulse', 'Beat'], ['beatPhase', 'Beat phase'], ['kickPulse', 'Kick'], ['snarePulse', 'Snare'],
  ['onsetPulse', 'Transient'], ['sectionEnergy', 'Section energy'], ['songProgress', 'Song progress'], ['sineLfo', 'Sine LFO'],
  ['triangleLfo', 'Triangle LFO'], ['sawLfo', 'Saw LFO'], ['smoothRandom', 'Smooth random'],
].map(([value, label]) => ({ value: value as ModulationSource, label }));

const LAYER_OPTIONS: readonly { value: LayerType; label: string }[] = [
  { value: 'chladni', label: 'Chladni field' }, { value: 'spectrum', label: 'Radial spectrum' },
  { value: 'shape', label: 'Procedural shape' }, { value: 'waveform', label: 'Waveform ring' },
  { value: 'particles', label: 'Particle field' }, { value: 'grid', label: 'Perspective grid' },
];

const SHAPE_OPTIONS: readonly { value: ShapeType; label: string }[] = [
  'circle', 'ring', 'triangle', 'square', 'pentagon', 'hexagon', 'octagon', 'star', 'flower', 'spiral',
].map((value) => ({ value: value as ShapeType, label: value[0].toUpperCase() + value.slice(1) }));

const BLEND_OPTIONS: readonly { value: BlendMode; label: string }[] = [
  'normal', 'add', 'screen', 'multiply', 'lighten', 'difference',
].map((value) => ({ value: value as BlendMode, label: value[0].toUpperCase() + value.slice(1) }));

function InspectorSection({ title, children, count, open = false }: { title: string; children: ReactNode; count?: number; open?: boolean }) {
  return (
    <details className="designer-section" open={open}>
      <summary><span>{title}</span>{count !== undefined && <b>{count}</b>}</summary>
      <div className="designer-section-body">{children}</div>
    </details>
  );
}

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65 + Math.floor(Math.random() * 30);
  const lightness = 55 + Math.floor(Math.random() * 25);
  const match = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(`hsl(${hue}, ${saturation}%, ${lightness}%)`)!;
  const h = Number(match[1]) / 360; const s = Number(match[2]) / 100; const l = Number(match[3]) / 100;
  const hueToRgb = (p: number, q: number, t: number) => {
    let next = t; if (next < 0) next += 1; if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const rgb = [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
  return `#${rgb.map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function VisualDesigner({ project, updateProject, currentTime, duration, sampled, undo, redo, canUndo, canRedo, exportProgress }: Props) {
  const [search, setSearch] = useState('');
  const [selectedLayerId, setSelectedLayerId] = useState(project.layers[0]?.id ?? '');
  const [newLayerType, setNewLayerType] = useState<LayerType>('shape');
  const [routeTarget, setRouteTarget] = useState('masters.scale');
  const [automationTarget, setAutomationTarget] = useState('masters.brightness');
  const [pins, setPins] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('resonance-pinned-controls') ?? '[]') as string[]; } catch { return []; }
  });
  const selectedLayer = project.layers.find((layer) => layer.id === selectedLayerId) ?? project.layers[0];

  useEffect(() => { localStorage.setItem('resonance-pinned-controls', JSON.stringify(pins)); }, [pins]);
  useEffect(() => {
    if (!project.layers.some((layer) => layer.id === selectedLayerId)) setSelectedLayerId(project.layers[0]?.id ?? '');
  }, [project.layers, selectedLayerId]);

  const dynamicTargets = useMemo(() => [
    ...PARAMETERS.map((parameter) => ({ value: parameter.id, label: parameter.label })),
    ...project.layers.flatMap((layer) => [
      { value: `layer:${layer.id}:opacity`, label: `${layer.name} · Opacity` },
      { value: `layer:${layer.id}:scale`, label: `${layer.name} · Scale` },
      { value: `layer:${layer.id}:rotation`, label: `${layer.name} · Rotation` },
      { value: `layer:${layer.id}:detail`, label: `${layer.name} · Detail` },
    ]),
  ], [project.layers]);

  const updateLayer = <K extends keyof CompositionLayer>(key: K, value: CompositionLayer[K], force = false) => {
    if (!selectedLayer || (selectedLayer.locked && !force)) return;
    updateProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === selectedLayer.id ? { ...layer, [key]: value } : layer),
    }), `layer:${selectedLayer.id}:${String(key)}`);
  };

  const updateScene = <K extends keyof ProjectState['scene']>(key: K, value: ProjectState['scene'][K]) => {
    updateProject((current) => ({ ...current, scene: { ...current.scene, [key]: value } }), `scene.${String(key)}`);
  };

  const renderParameter = (definition: ParameterDefinition) => {
    if (search && !`${definition.label} ${definition.section} ${definition.help}`.toLowerCase().includes(search.toLowerCase())) return null;
    const value = getProjectNumber(project, definition.id) ?? definition.defaultValue;
    const pinned = pins.includes(definition.id);
    return <RangeControl
      key={definition.id}
      label={definition.label}
      value={value}
      min={definition.min}
      max={definition.max}
      step={definition.step}
      defaultValue={definition.defaultValue}
      title={definition.help}
      action={<button type="button" className={`pin-button ${pinned ? 'active' : ''}`} title={pinned ? 'Unpin control' : 'Pin to Quick Controls'} onClick={(event) => { event.preventDefault(); setPins((current) => pinned ? current.filter((id) => id !== definition.id) : [...current, definition.id]); }}>◆</button>}
      onChange={(value) => updateProject((current) => setProjectNumber(current, definition.id, value), definition.id)}
    />;
  };

  const randomize = (scope: 'all' | 'geometry' | 'color' | 'effects') => {
    updateProject((current) => {
      let next = current;
      if (scope === 'all' || scope === 'geometry') next = {
        ...next,
        scene: { ...next.scene, symmetry: 4 + Math.floor(Math.random() * 9), contourCount: 6 + Math.floor(Math.random() * 10), distortion: 0.08 + Math.random() * 0.3 },
        layers: next.layers.map((layer) => ({ ...layer, scale: 0.75 + Math.random() * 0.45, rotation: (Math.random() - 0.5) * 0.8 })),
      };
      if (scope === 'all' || scope === 'color') next = {
        ...next,
        scene: { ...next.scene, primaryColor: randomColor(), secondaryColor: randomColor(), backgroundColor: '#030407', backgroundColor2: randomColor() },
        layers: next.layers.map((layer) => ({ ...layer, color: randomColor(), secondaryColor: randomColor() })),
      };
      if (scope === 'all' || scope === 'effects') next = {
        ...next,
        scene: { ...next.scene, glow: 0.8 + Math.random(), chromaticAberration: Math.random() * 0.025, scanlines: Math.random() * 0.28, vignette: 0.45 + Math.random() * 0.45, grain: Math.random() * 0.22 },
      };
      return next;
    }, `randomize-${Date.now()}`);
  };

  const parameterSections = ['Master', 'Geometry', 'Motion', 'Audio', 'Post Processing'] as const;
  const hasSearch = search.trim().length > 0;

  return (
    <div className="visual-designer">
      <div className="designer-tools">
        <label className="parameter-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parameters" /></label>
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">↷</button>
      </div>

      {pins.length > 0 && <InspectorSection title="Quick controls" count={pins.length} open>{PARAMETERS.filter((parameter) => pins.includes(parameter.id)).map(renderParameter)}</InspectorSection>}

      {!hasSearch && <InspectorSection title="Layers" count={project.layers.length} open>
        <div className="layer-stack">
          {[...project.layers].reverse().map((layer) => (
            <div key={layer.id} className={`layer-row ${layer.id === selectedLayer?.id ? 'selected' : ''}`}>
              <button className={layer.visible ? 'active' : ''} title="Visibility" onClick={() => {
                updateProject((current) => ({ ...current, layers: current.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, visible: !candidate.visible } : candidate) }), `visibility:${layer.id}`);
              }}>◉</button>
              <button className="layer-name" onClick={() => setSelectedLayerId(layer.id)}><strong>{layer.name}</strong><small>{layer.type}</small></button>
              <button className={layer.solo ? 'active' : ''} title="Solo" onClick={() => updateProject((current) => ({ ...current, layers: current.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, solo: !candidate.solo } : candidate) }), `solo:${layer.id}`)}>S</button>
              <button className={layer.locked ? 'active' : ''} title="Lock" onClick={() => updateProject((current) => ({ ...current, layers: current.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, locked: !candidate.locked } : candidate) }), `lock:${layer.id}`)}>◆</button>
            </div>
          ))}
        </div>
        <div className="layer-add"><select value={newLayerType} onChange={(event) => setNewLayerType(event.target.value as LayerType)}>{LAYER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button onClick={() => {
          const layer = createLayer(newLayerType); updateProject((current) => ({ ...current, layers: [...current.layers, layer].slice(-8) }), 'add-layer'); setSelectedLayerId(layer.id);
        }} disabled={project.layers.length >= 8}>+ Add</button></div>
        {selectedLayer && <>
          <div className="layer-actions">
            <button onClick={() => {
              const index = project.layers.findIndex((layer) => layer.id === selectedLayer.id); if (index <= 0) return;
              updateProject((current) => { const layers = [...current.layers]; [layers[index - 1], layers[index]] = [layers[index], layers[index - 1]]; return { ...current, layers }; }, 'reorder-layer');
            }}>↓ Lower</button>
            <button onClick={() => {
              const index = project.layers.findIndex((layer) => layer.id === selectedLayer.id); if (index < 0 || index >= project.layers.length - 1) return;
              updateProject((current) => { const layers = [...current.layers]; [layers[index + 1], layers[index]] = [layers[index], layers[index + 1]]; return { ...current, layers }; }, 'reorder-layer');
            }}>↑ Raise</button>
            <button onClick={() => { const copy = { ...selectedLayer, id: createId('layer'), name: `${selectedLayer.name} copy`, locked: false }; updateProject((current) => ({ ...current, layers: [...current.layers, copy].slice(-8) }), 'duplicate-layer'); setSelectedLayerId(copy.id); }}>Duplicate</button>
            <button className="danger" disabled={project.layers.length <= 1 || selectedLayer.locked} onClick={() => updateProject((current) => ({ ...current, layers: current.layers.filter((layer) => layer.id !== selectedLayer.id) }), 'delete-layer')}>Delete</button>
          </div>
          <label className="text-control"><span>Name</span><input value={selectedLayer.name} disabled={selectedLayer.locked} onChange={(event) => updateLayer('name', event.target.value)} /></label>
          <RangeControl label="Opacity" value={selectedLayer.opacity} min={0} max={1} step={0.01} defaultValue={1} onChange={(value) => updateLayer('opacity', value)} />
          <SelectControl label="Blend mode" value={selectedLayer.blendMode} options={BLEND_OPTIONS} onChange={(value) => updateLayer('blendMode', value)} />
        </>}
      </InspectorSection>}

      {!hasSearch && selectedLayer && <InspectorSection title={`${selectedLayer.type} layer`} open>
        <RangeControl label="Position X" value={selectedLayer.positionX} min={-1.5} max={1.5} step={0.01} defaultValue={0} onChange={(value) => updateLayer('positionX', value)} />
        <RangeControl label="Position Y" value={selectedLayer.positionY} min={-1.5} max={1.5} step={0.01} defaultValue={0} onChange={(value) => updateLayer('positionY', value)} />
        <RangeControl label="Scale" value={selectedLayer.scale} min={0.1} max={3} step={0.01} defaultValue={1} onChange={(value) => updateLayer('scale', value)} />
        <RangeControl label="Rotation" value={selectedLayer.rotation} min={-3.14} max={3.14} step={0.01} defaultValue={0} onChange={(value) => updateLayer('rotation', value)} />
        <RangeControl label="Motion speed" value={selectedLayer.speed} min={-1} max={1} step={0.01} defaultValue={0} onChange={(value) => updateLayer('speed', value)} />
        <ColorControl label="Primary" value={selectedLayer.color} onChange={(value) => updateLayer('color', value)} />
        <ColorControl label="Secondary" value={selectedLayer.secondaryColor} onChange={(value) => updateLayer('secondaryColor', value)} />
        <SelectControl label="Audio source" value={selectedLayer.audioSource} options={SOURCE_OPTIONS} onChange={(value) => updateLayer('audioSource', value)} />
        <RangeControl label="Audio amount" value={selectedLayer.audioAmount} min={-1} max={2} step={0.01} defaultValue={0} onChange={(value) => updateLayer('audioAmount', value)} />
        {(selectedLayer.type === 'shape') && <>
          <SelectControl label="Shape" value={selectedLayer.shape} options={SHAPE_OPTIONS} onChange={(value) => updateLayer('shape', value)} />
          {['star', 'flower', 'spiral'].includes(selectedLayer.shape) && <RangeControl label="Points / turns" value={selectedLayer.sides} min={3} max={32} step={1} defaultValue={6} onChange={(value) => updateLayer('sides', value)} />}
        </>}
        {['shape', 'spectrum', 'waveform'].includes(selectedLayer.type) && <>
          <RangeControl label="Radius" value={selectedLayer.innerRadius} min={0.05} max={1.2} step={0.01} defaultValue={0.48} onChange={(value) => updateLayer('innerRadius', value)} />
          <RangeControl label="Thickness" value={selectedLayer.thickness} min={0.002} max={0.25} step={0.002} defaultValue={0.04} onChange={(value) => updateLayer('thickness', value)} />
        </>}
        <RangeControl label="Detail" value={selectedLayer.detail} min={0} max={1.5} step={0.01} defaultValue={0.7} onChange={(value) => updateLayer('detail', value)} />
      </InspectorSection>}

      {parameterSections.map((section) => {
        const definitions = PARAMETERS.filter((parameter) => parameter.section === section);
        const visible = definitions.some((definition) => !search || `${definition.label} ${definition.section} ${definition.help}`.toLowerCase().includes(search.toLowerCase()));
        if (!visible) return null;
        return <InspectorSection key={section} title={section} open={hasSearch || section === 'Master'}>{definitions.map(renderParameter)}</InspectorSection>;
      })}

      {!hasSearch && <InspectorSection title="Color & background">
        <ColorControl label="Primary" value={project.scene.primaryColor} onChange={(value) => updateScene('primaryColor', value)} />
        <ColorControl label="Secondary" value={project.scene.secondaryColor} onChange={(value) => updateScene('secondaryColor', value)} />
        <SelectControl label="Background" value={project.scene.backgroundType} options={['solid', 'linear', 'radial', 'grid'].map((value) => ({ value: value as ProjectState['scene']['backgroundType'], label: value[0].toUpperCase() + value.slice(1) }))} onChange={(value) => updateScene('backgroundType', value)} />
        <ColorControl label="Background A" value={project.scene.backgroundColor} onChange={(value) => updateScene('backgroundColor', value)} />
        {project.scene.backgroundType !== 'solid' && <ColorControl label="Background B" value={project.scene.backgroundColor2} onChange={(value) => updateScene('backgroundColor2', value)} />}
        {project.scene.backgroundType === 'linear' && <RangeControl label="Gradient angle" value={project.scene.backgroundAngle} min={0} max={360} step={1} defaultValue={135} onChange={(value) => updateScene('backgroundAngle', value)} />}
      </InspectorSection>}

      {!hasSearch && <InspectorSection title="Modulation" count={project.modulation.length}>
        <div className="inline-add"><select value={routeTarget} onChange={(event) => setRouteTarget(event.target.value)}>{dynamicTargets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select><button onClick={() => updateProject((current) => ({ ...current, modulation: [...current.modulation, { id: createId('mod'), source: 'bass', target: routeTarget, amount: 0.25, bipolar: false, invert: false, curve: 1, minimum: -2, maximum: 2, lfoRate: 0.25, phase: 0, enabled: true }] }), 'add-modulation')}>+ Route</button></div>
        {project.modulation.map((route) => <div className="route-card" key={route.id}>
          <div className="route-heading"><ToggleControl label="Enabled" value={route.enabled} onChange={(value) => updateProject((current) => ({ ...current, modulation: current.modulation.map((item) => item.id === route.id ? { ...item, enabled: value } : item) }), `route:${route.id}:enabled`)} /><button onClick={() => updateProject((current) => ({ ...current, modulation: current.modulation.filter((item) => item.id !== route.id) }), 'delete-route')}>×</button></div>
          <SelectControl label="Source" value={route.source} options={SOURCE_OPTIONS} onChange={(value) => updateProject((current) => ({ ...current, modulation: current.modulation.map((item) => item.id === route.id ? { ...item, source: value } : item) }), `route:${route.id}:source`)} />
          <RangeControl label="Amount" value={route.amount} min={-2} max={2} step={0.01} defaultValue={0.25} onChange={(value) => updateProject((current) => ({ ...current, modulation: current.modulation.map((item) => item.id === route.id ? { ...item, amount: value } : item) }), `route:${route.id}:amount`)} />
          <RangeControl label="Curve" value={route.curve} min={0.1} max={4} step={0.05} defaultValue={1} onChange={(value) => updateProject((current) => ({ ...current, modulation: current.modulation.map((item) => item.id === route.id ? { ...item, curve: value } : item) }), `route:${route.id}:curve`)} />
          {route.source.endsWith('Lfo') || route.source === 'smoothRandom' ? <RangeControl label="Rate" value={route.lfoRate} min={0.015625} max={8} step={0.015625} defaultValue={0.25} onChange={(value) => updateProject((current) => ({ ...current, modulation: current.modulation.map((item) => item.id === route.id ? { ...item, lfoRate: value } : item) }), `route:${route.id}:rate`)} /> : null}
        </div>)}
      </InspectorSection>}

      {!hasSearch && <InspectorSection title="Automation" count={project.automation.reduce((sum, track) => sum + track.keyframes.length, 0)}>
        <div className="inline-add"><select value={automationTarget} onChange={(event) => setAutomationTarget(event.target.value)}>{dynamicTargets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</select><button onClick={() => {
          const base = getProjectNumber(project, automationTarget) ?? 0;
          updateProject((current) => {
            const existing = current.automation.find((track) => track.target === automationTarget);
            const keyframe = { id: createId('key'), time: currentTime, value: base, easing: 'easeInOut' as const };
            return existing ? { ...current, automation: current.automation.map((track) => track.id === existing.id ? { ...track, keyframes: [...track.keyframes.filter((item) => Math.abs(item.time - currentTime) > 0.001), keyframe].sort((a, b) => a.time - b.time) } : track) } : { ...current, automation: [...current.automation, { id: createId('track'), target: automationTarget, enabled: true, keyframes: [keyframe] }] };
          }, 'add-keyframe');
        }}>◆ Keyframe</button></div>
        {project.automation.map((track) => <div className="automation-track" key={track.id}><div><strong>{dynamicTargets.find((target) => target.value === track.target)?.label ?? track.target}</strong><small>{track.keyframes.length} keyframe{track.keyframes.length === 1 ? '' : 's'}</small></div><div className="keyframe-dots">{track.keyframes.map((keyframe) => <button key={keyframe.id} title={`${keyframe.time.toFixed(2)}s · ${keyframe.value.toFixed(2)}`} style={{ left: `${duration > 0 ? keyframe.time / duration * 100 : 0}%` }} onClick={() => updateProject((current) => ({ ...current, automation: current.automation.map((candidate) => candidate.id === track.id ? { ...candidate, keyframes: candidate.keyframes.filter((item) => item.id !== keyframe.id) } : candidate) }), 'delete-keyframe')}>◆</button>)}</div></div>)}
      </InspectorSection>}

      {!hasSearch && <InspectorSection title="Randomize">
        <p className="section-note">Safe ranges preserve legibility. Every randomization is one undoable action.</p>
        <div className="random-grid"><button onClick={() => randomize('all')}>Entire visual</button><button onClick={() => randomize('geometry')}>Geometry</button><button onClick={() => randomize('color')}>Color</button><button onClick={() => randomize('effects')}>Effects</button></div>
      </InspectorSection>}

      {!hasSearch && <InspectorSection title="Performance & export">
        <SelectControl label="Preview mode" value={project.performance.mode} options={['low', 'medium', 'high', 'ultra', 'custom'].map((value) => ({ value: value as PerformanceMode, label: value[0].toUpperCase() + value.slice(1) }))} onChange={(mode) => {
          const profile = { low: [0.5, 4], medium: [0.75, 6], high: [1, 8], ultra: [1.25, 8], custom: [project.performance.previewResolution, project.performance.maxLayers] }[mode];
          updateProject((current) => ({ ...current, performance: { mode, previewResolution: Number(profile[0]), maxLayers: Number(profile[1]) } }), 'performance-mode');
        }} />
        <SelectControl label="Resolution" value={`${project.export.width}x${project.export.height}`} options={[
          { value: '1280x720', label: '720p' }, { value: '1920x1080', label: '1080p' }, { value: '2560x1440', label: '1440p' }, { value: '3840x2160', label: '4K' }, { value: '1080x1920', label: 'Vertical' }, { value: '1080x1080', label: 'Square' },
        ]} onChange={(value) => { const [width, height] = value.split('x').map(Number); updateProject((current) => ({ ...current, export: { ...current.export, width, height } }), 'export-resolution'); }} />
        <SelectControl label="Frame rate" value={String(project.export.fps)} options={['24', '30', '60'].map((value) => ({ value, label: `${value} FPS` }))} onChange={(value) => updateProject((current) => ({ ...current, export: { ...current.export, fps: Number(value) } }), 'export-fps')} />
        {exportProgress}
      </InspectorSection>}

      {!hasSearch && <InspectorSection title="Analysis signals">
        {sampled ? <div className="meter-list">{[
          ['SUB', sampled.subBass], ['BASS', sampled.bass], ['LOW MID', sampled.lowMid], ['MID', sampled.mid], ['HIGH MID', sampled.upperMid], ['TREBLE', sampled.high], ['RMS', sampled.rms], ['FLUX', sampled.flux],
        ].map(([label, value]) => <div className="meter" key={String(label)}><span>{label}</span><i><b style={{ width: `${Math.min(100, Number(value) * 100)}%` }} /></i><output>{Number(value).toFixed(2)}</output></div>)}</div> : <p className="section-note">Load audio to inspect the authoritative timeline signals.</p>}
      </InspectorSection>}
    </div>
  );
}
