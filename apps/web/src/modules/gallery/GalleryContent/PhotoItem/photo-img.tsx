import { cn } from "@/lib/utils";
import { profileGenerationAtom } from "@/modules/settings/profile-generation";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_IMAGE_SIZE,
  setNaturalSizesAtom,
} from "../../hooks/use-calculate-layout";
import { useDisplayableImage } from "@/lib/heic/use-displayable-image";

/**
 * <img> wrapper for displaying the photo image.
 *
 * It does:
 * - Show `thumbnailUrl` when given, falling back to `url` if it fails.
 * - Convert HEIC/HEIF to a paintable URL on browsers that can't render it.
 * - Handle the loading state ("loading", "loaded", "error").
 * - Cache the natural size.
 */
export function PhotoImg({
  s3Key,
  url,
  thumbnailUrl,
  setLoadingState,
  ...props
}: {
  s3Key: string;
  url: string;
  /** A smaller rendition to show instead of `url` (e.g. a gallery tile). */
  thumbnailUrl?: string;
  setLoadingState: (state: "loading" | "loaded" | "error") => void;
} & React.ComponentProps<"img">) {
  const imgRef = useRef<HTMLImageElement>(null);
  const store = useStore();
  const profileGeneration = useAtomValue(profileGenerationAtom);
  const setNaturalSizes = useSetAtom(setNaturalSizesAtom);
  // A thumbnail that failed (e.g. the transformation quota is used up) falls
  // back to the original for as long as it is the thumbnail on offer.
  const [failedThumbnail, setFailedThumbnail] = useState<string>();
  const shownUrl =
    thumbnailUrl && thumbnailUrl !== failedThumbnail ? thumbnailUrl : url;
  // Resolve HEIC to a JPEG object URL where the browser can't paint it natively.
  const { src, status: convertStatus } = useDisplayableImage(shownUrl);

  const handleLoad = useCallback(() => {
    if (store.get(profileGenerationAtom) !== profileGeneration) return;
    if (!imgRef.current) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    if (naturalWidth === 0 || naturalHeight === 0) {
      return;
    }

    setNaturalSizes([s3Key, [naturalWidth, naturalHeight]]);
    setLoadingState("loaded");
  }, [profileGeneration, s3Key, setNaturalSizes, setLoadingState, store]);

  const reportError = useCallback(() => {
    if (store.get(profileGenerationAtom) !== profileGeneration) return;
    setNaturalSizes([s3Key, DEFAULT_IMAGE_SIZE]);
    setLoadingState("error");
  }, [profileGeneration, s3Key, setNaturalSizes, setLoadingState, store]);

  const handleError = useCallback(() => {
    if (store.get(profileGenerationAtom) !== profileGeneration) return;
    if (shownUrl !== url) {
      setFailedThumbnail(shownUrl);
      return;
    }
    reportError();
  }, [profileGeneration, reportError, shownUrl, store, url]);

  // Mirror the conversion lifecycle onto the loading state: "converting" keeps
  // the skeleton up, a failed conversion surfaces the error state. A successful
  // conversion ("ready") hands off to the <img> onLoad/onError below.
  // Conversion only applies to HEIC, which never has a thumbnail.
  useEffect(() => {
    if (convertStatus === "converting") {
      setLoadingState("loading");
    } else if (convertStatus === "error") {
      reportError();
    }
  }, [convertStatus, setLoadingState, reportError]);

  useEffect(() => {
    if (imgRef.current?.complete) {
      handleLoad();
    }
  }, [handleLoad, src]);

  // Nothing paintable yet (converting or failed): let the parent show its
  // skeleton/error UI via the loading state set above.
  if (!src) return null;

  return (
    <img
      {...props}
      className={cn("select-none", props.className)}
      ref={imgRef}
      src={src}
      alt={s3Key}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
