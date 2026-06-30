import { useEffect, useRef, useState } from 'react';

export function useViewerPanelsState() {
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const adjustmentsRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const downloadModalRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(target)) {
        setIsDatePickerOpen(false);
      }
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
        setIsSettingsOpen(false);
        setIsDatePickerOpen(false);
        setIsInfoOpen(false);
        setIsAdjustmentsOpen(false);
        setIsDownloadModalOpen(false);
      }
    };

    if (isSettingsOpen || isDatePickerOpen || isInfoOpen || isAdjustmentsOpen || isDownloadModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isSettingsOpen, isDatePickerOpen, isInfoOpen, isAdjustmentsOpen, isDownloadModalOpen]);

  return {
    adjustmentsRef,
    datePickerRef,
    downloadModalRef,
    infoRef,
    isAdjustmentsOpen,
    isDatePickerOpen,
    isDownloadModalOpen,
    isInfoOpen,
    isSettingsOpen,
    setIsAdjustmentsOpen,
    setIsDatePickerOpen,
    setIsDownloadModalOpen,
    setIsInfoOpen,
    setIsSettingsOpen,
    settingsRef,
  };
}
