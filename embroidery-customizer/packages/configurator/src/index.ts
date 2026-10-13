export { Configurator, DEFAULT_SETTINGS } from './components/Configurator';
export type {
  ConfiguratorProps,
  ConfiguratorSettings,
  EditRequest,
} from './components/Configurator';
export { mountConfigurator, type MountHandle } from './mount';
export { GarmentViewer } from './engine/garmentViewer';
export { DesignRasterizer } from './engine/designRasterizer';
export { buildDecalGeometry } from './engine/decalGeometry';
export { DemoPersistence } from './persistence/demoPersistence';
export { AppProxyPersistence } from './persistence/appProxyPersistence';
export type { PersistenceAdapter } from './persistence/types';
export * from './state/editorState';
export { sharedRefFromUrl, shareUrl, listSavedDesigns, SHARE_PARAM } from './state/savedDesigns';
export { floodRemoveBackground, removeBackground } from './engine/backgroundRemoval';
