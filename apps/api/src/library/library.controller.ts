import { Controller, Get } from "@nestjs/common";
import { resolveWorkspaceDir } from "@studio/shared";
import { readLibraryNotices } from "./library-notices";

@Controller("library")
export class LibraryController {
  /** Packs of the asset library, their authors and license texts: the « À propos » screen. */
  @Get("notices")
  notices() {
    return readLibraryNotices(resolveWorkspaceDir());
  }
}
