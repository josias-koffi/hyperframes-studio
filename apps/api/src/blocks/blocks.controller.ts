import { Controller, Get } from "@nestjs/common";
import { resolveWorkspaceDir } from "@studio/shared";
import { listBlocks } from "./list-blocks";

@Controller("blocks")
export class BlocksController {
  /** The blocks of the « Blocs » screen, each with a page that plays it on a loop. */
  @Get()
  list() {
    return listBlocks(resolveWorkspaceDir());
  }
}
