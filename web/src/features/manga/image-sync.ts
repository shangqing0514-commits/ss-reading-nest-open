import type { FileReference } from "@ss/shared";

type UploadFile = (file: File) => Promise<FileReference>;

export async function prepareCurrentPageContext(input: {
  file: File;
  pageDescription: string;
  userNote: string;
  uploadFile?: UploadFile;
}): Promise<{
  syncMode: "image" | "description";
  currentPageImage?: FileReference;
  pageDescription?: string;
  userNote?: string;
  warning?: string;
}> {
  if (input.uploadFile) {
    try {
      const currentPageImage = await input.uploadFile(input.file);
      return {
        syncMode: "image",
        currentPageImage,
        ...(input.pageDescription ? { pageDescription: input.pageDescription } : {}),
        ...(input.userNote ? { userNote: input.userNote } : {})
      };
    } catch {
      // Description mode is the intentional safe fallback.
    }
  }
  return {
    syncMode: "description",
    ...(input.pageDescription ? { pageDescription: input.pageDescription } : {}),
    ...(input.userNote ? { userNote: input.userNote } : {}),
    warning: "当前环境暂不支持图片同步，可以先用页面描述让烁构共读。"
  };
}
