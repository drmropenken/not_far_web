import React, { useState, useEffect, useRef } from 'react';

interface ImageCarouselProps {
  images: string[];
  alt?: string;
  className?: string;
}

export default function ImageCarousel({ images, alt = "Image", className = "" }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (images.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 3000);

    return () => clearInterval(timer);
  }, [images.length, isPaused]);

  if (!images || images.length === 0) {
    return (
      <div className={`bg-slate-100 flex items-center justify-center text-slate-400 ${className}`}>
        無圖片
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <img
        src={images[0]}
        alt={alt}
        className={`w-full h-full object-cover object-center ${className}`}
      />
    );
  }

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  return (
    <div 
      className={`relative group w-full h-full overflow-hidden ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        className="flex h-full w-full transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {images.map((src, idx) => (
          <img
            key={idx}
            src={src}
            alt={`${alt} - ${idx + 1}`}
            className="w-full h-full shrink-0 object-cover object-center"
          />
        ))}
      </div>
      
      {/* Navigation arrows (show on hover) */}
      <div className="absolute inset-0 flex items-center justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handlePrev}
          className="bg-black/40 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70 backdrop-blur-md transition-colors border-none cursor-pointer"
          aria-label="Previous image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={handleNext}
          className="bg-black/40 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70 backdrop-blur-md transition-colors border-none cursor-pointer"
          aria-label="Next image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
      
      {/* Dots indicator */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex(idx);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === currentIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Go to image ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
