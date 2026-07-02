import { useEffect, useRef, useState } from 'react';

export function useViewerPanelsState() {
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isAnimationModalOpen, setIsAnimationModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const adjustmentsRef = useRef<HTMLDivElement>(null);
  const animationModalRef = useRef<HTMLDivElement>(null);
  const downloadModalRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
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
      if (helpRef.current && !helpRef.current.contains(target)) {
        setIsHelpOpen(false);
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
        setIsHelpOpen(false);
      }
    };

    if (isInfoOpen || isAdjustmentsOpen || isDownloadModalOpen || isAnimationModalOpen || isHelpOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isInfoOpen, isAdjustmentsOpen, isDownloadModalOpen, isAnimationModalOpen, isHelpOpen]);

  return {
    adjustmentsRef,
    animationModalRef,
    downloadModalRef,
    helpRef,
    infoRef,
    isAdjustmentsOpen,
    isAnimationModalOpen,
    isDownloadModalOpen,
    isHelpOpen,
    isInfoOpen,
    setIsAdjustmentsOpen,
    setIsAnimationModalOpen,
    setIsDownloadModalOpen,
    setIsHelpOpen,
    setIsInfoOpen,
  };
}
