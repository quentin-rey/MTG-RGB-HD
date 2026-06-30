import { useEffect, useRef, useState } from 'react';

export function useViewerPanelsState() {
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const adjustmentsRef = useRef<HTMLDivElement>(null);
  const downloadModalRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (infoRef.current && !infoRef.current.contains(target)) {
        setIsInfoOpen(false);
      }
      if (adjustmentsRef.current && !adjustmentsRef.current.contains(target)) {
        setIsAdjustmentsOpen(false);
      }
      if (downloadModalRef.current && !downloadModalRef.current.contains(target)) {
        setIsDownloadModalOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
        setIsAdjustmentsOpen(false);
        setIsDownloadModalOpen(false);
      }
    };

    if (isInfoOpen || isAdjustmentsOpen || isDownloadModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isInfoOpen, isAdjustmentsOpen, isDownloadModalOpen]);

  return {
    adjustmentsRef,
    downloadModalRef,
    infoRef,
    isAdjustmentsOpen,
    isDownloadModalOpen,
    isInfoOpen,
    setIsAdjustmentsOpen,
    setIsDownloadModalOpen,
    setIsInfoOpen,
  };
}
