import { useEffect, useRef, useState } from 'react';

export function useViewerPanelsState() {
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isFireHotspotOpen, setIsFireHotspotOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);

  const adjustmentsRef = useRef<HTMLDivElement>(null);
  const exportModalRef = useRef<HTMLDivElement>(null);
  const fireHotspotRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (infoRef.current && !infoRef.current.contains(target)) {
        setIsInfoOpen(false);
      }
      if (adjustmentsRef.current && !adjustmentsRef.current.contains(target)) {
        setIsAdjustmentsOpen(false);
      }
      if (fireHotspotRef.current && !fireHotspotRef.current.contains(target)) {
        setIsFireHotspotOpen(false);
      }
      if (exportModalRef.current && !exportModalRef.current.contains(target)) {
        setIsExportModalOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(target)) {
        setIsHelpOpen(false);
      }
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(target)) {
        setIsOverflowMenuOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
        setIsAdjustmentsOpen(false);
        setIsFireHotspotOpen(false);
        setIsExportModalOpen(false);
        setIsHelpOpen(false);
        setIsOverflowMenuOpen(false);
      }
    };

    if (isInfoOpen || isAdjustmentsOpen || isFireHotspotOpen || isExportModalOpen || isHelpOpen || isOverflowMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isInfoOpen, isAdjustmentsOpen, isFireHotspotOpen, isExportModalOpen, isHelpOpen, isOverflowMenuOpen]);

  return {
    adjustmentsRef,
    exportModalRef,
    fireHotspotRef,
    helpRef,
    infoRef,
    isAdjustmentsOpen,
    isExportModalOpen,
    isFireHotspotOpen,
    isHelpOpen,
    isInfoOpen,
    isOverflowMenuOpen,
    overflowMenuRef,
    setIsAdjustmentsOpen,
    setIsExportModalOpen,
    setIsFireHotspotOpen,
    setIsHelpOpen,
    setIsInfoOpen,
    setIsOverflowMenuOpen,
  };
}
