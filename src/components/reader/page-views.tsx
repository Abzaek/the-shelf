"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Page } from "react-pdf";
import { Skeleton } from "@/components/ui/skeleton";
import { highlightText } from "./highlight";

interface CommonProps {
  numPages: number;
  currentPage: number;
  pageWidth: number;
  /** height / width of the first page, for placeholders */
  aspect: number;
  searchQuery: string;
  onPageChange: (page: number) => void;
}

const PAGE_GAP = 16;

function PagePlaceholder({ width, aspect, page }: { width: number; aspect: number; page: number }) {
  return (
    <div
      className="relative mx-auto flex items-end justify-center rounded-[2px] bg-paper shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
      style={{ width, height: Math.round(width * aspect) }}
      aria-hidden
    >
      <span className="mb-3 text-[11px] tabular-nums text-muted-foreground/70">{page}</span>
    </div>
  );
}

const PdfPage = memo(function PdfPage({ pageNumber, width, searchQuery }: { pageNumber: number; width: number; searchQuery: string }) {
  const textRenderer = useCallback(
    ({ str }: { str: string }) => highlightText(str, searchQuery),
    [searchQuery],
  );
  return (
    <Page
      pageNumber={pageNumber}
      width={width}
      renderAnnotationLayer
      renderTextLayer
      customTextRenderer={searchQuery ? textRenderer : undefined}
      className="shadow-[0_1px_3px_rgb(0_0_0/0.16),0_12px_32px_-12px_rgb(0_0_0/0.35)]"
      loading={<Skeleton className="rounded-[2px]" style={{ width, height: width * 1.4 }} />}
      error={
        <div className="flex items-center justify-center bg-paper text-sm text-destructive" style={{ width, height: width * 1.4 }}>
          This page could not be rendered.
        </div>
      }
    />
  );
});

/** Single page mode: only the current page is mounted. */
export function SinglePageView({ currentPage, pageWidth, searchQuery, onPageChange, numPages }: CommonProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage]);

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-auto scroll-thin"
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          onPageChange(dx < 0 ? Math.min(numPages, currentPage + 1) : Math.max(1, currentPage - 1));
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center px-2 py-4 sm:px-6 sm:py-6">
        <PdfPage pageNumber={currentPage} width={pageWidth} searchQuery={searchQuery} />
      </div>
    </div>
  );
}

/**
 * Continuous mode: every page has a fixed-size placeholder so scrolling is
 * stable; only pages within a small window around the viewport are rendered.
 */
export function ContinuousView({ numPages, currentPage, pageWidth, aspect, searchQuery, onPageChange }: CommonProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageHeight = Math.round(pageWidth * aspect);
  const stride = pageHeight + PAGE_GAP;
  const [visibleRange, setVisibleRange] = useState<[number, number]>([1, Math.min(numPages, 3)]);
  const programmatic = useRef<number | null>(null);
  const lastReported = useRef(currentPage);

  const compute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const center = top + el.clientHeight / 2;
    const centerPage = Math.min(numPages, Math.max(1, Math.floor(center / stride) + 1));
    const first = Math.max(1, Math.floor(top / stride) + 1 - 1);
    const last = Math.min(numPages, Math.ceil((top + el.clientHeight) / stride) + 1);
    setVisibleRange((r) => (r[0] === first && r[1] === last ? r : [first, last]));
    if (programmatic.current !== null) {
      if (centerPage === programmatic.current) programmatic.current = null;
      else return;
    }
    if (centerPage !== lastReported.current) {
      lastReported.current = centerPage;
      onPageChange(centerPage);
    }
  }, [numPages, stride, onPageChange]);

  // Scroll to the requested page when it changes from outside (toolbar, TOC, bookmark).
  useLayoutEffect(() => {
    if (currentPage === lastReported.current) return;
    const el = scrollRef.current;
    if (!el) return;
    programmatic.current = currentPage;
    lastReported.current = currentPage;
    el.scrollTop = (currentPage - 1) * stride;
    compute();
  }, [currentPage, stride, compute]);

  // Keep the same page in view when zoom changes the stride.
  const prevStride = useRef(stride);
  useLayoutEffect(() => {
    if (prevStride.current !== stride && scrollRef.current) {
      const page = lastReported.current;
      programmatic.current = page;
      scrollRef.current.scrollTop = (page - 1) * stride;
      prevStride.current = stride;
      compute();
    }
  }, [stride, compute]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    compute();
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [compute]);

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
  const [renderFrom, renderTo] = [Math.max(1, visibleRange[0] - 1), Math.min(numPages, visibleRange[1] + 1)];

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto scroll-thin">
      <div className="mx-auto px-2 py-4 sm:px-6 sm:py-6" style={{ width: pageWidth + 48 }}>
        {pages.map((p) => (
          <div key={p} style={{ marginBottom: PAGE_GAP, minHeight: pageHeight }} data-page={p}>
            {p >= renderFrom && p <= renderTo ? (
              <PdfPage pageNumber={p} width={pageWidth} searchQuery={searchQuery} />
            ) : (
              <PagePlaceholder width={pageWidth} aspect={aspect} page={p} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
