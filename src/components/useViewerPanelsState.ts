import { useEffect, useRef, useState } from 'react';

export function useViewerPanelsState() {
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isAnimationModalOpen, setIsAnimationModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const adjustmentsRef = useRef<HTMLDivElement>(null);
  const animationModalRef = useRef<HTMLDivElement>(null);
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
      if (animationModalRef.current && !animationModalRef.current.contains(target)) {
        setIsAnimationModalOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
        setIsAdjustmentsOpen(false);
        setIsAnimationModalOpen(false);
        setIsDownloadModalOpen(false);
      }
    };

    if (isInfoOpen || isAdjustmentsOpen || isDownloadModalOpen || isAnimationModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isInfoOpen, isAdjustmentsOpen, isDownloadModalOpen, isAnimationModalOpen]);

  return {
    adjustmentsRef,
    animationModalRef,
    downloadModalRef,
    infoRef,
    isAdjustmentsOpen,
    isAnimationModalOpen,
    isDownloadModalOpen,
    isInfoOpen,
    setIsAdjustmentsOpen,
    setIsAnimationModalOpen,
    setIsDownloadModalOpen,
    setIsInfoOpen,
  };
}
