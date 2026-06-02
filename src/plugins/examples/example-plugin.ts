import type { CardForgePluginModule } from "../api/types";

export const plugin: CardForgePluginModule = {
  activate(api) {
    api.log(`Example plugin loaded for ${api.listCharacters().length} characters.`);
  },
  deactivate() {
    return undefined;
  }
};
