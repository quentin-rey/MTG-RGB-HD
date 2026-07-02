import { useEffect, useState } from 'react';

import { encodeShareSnapshot, type ShareSnapshot } from './shareSnapshot';

type ShareLinkMessages = {
  copied: string;
  failed: string;
};

export function useShareLink() {
  const [shareToastMessage, setShareToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToastMessage) return;
    const timeout = window.setTimeout(() => setShareToastMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [shareToastMessage]);

  const copyShareLink = async (snapshot: ShareSnapshot, messages: ShareLinkMessages): Promise<boolean> => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('view', encodeShareSnapshot(snapshot));
    const shareUrl = nextUrl.toString();

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToastMessage(messages.copied);
      return true;
    } catch {
      setShareToastMessage(messages.failed);
      return false;
    }
  };

  return { shareToastMessage, setShareToastMessage, copyShareLink };
}
