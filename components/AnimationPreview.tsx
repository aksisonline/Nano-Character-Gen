import React, { useEffect, useRef, useState } from 'react';
import { SPRITE_WIDTH, SPRITE_HEIGHT } from '../constants';

interface AnimationPreviewProps {
    frames: number[][]; // Array of pixel arrays
    palette: (string | null)[];
    label: string;
    fps?: number;
    scale?: number;
}

const AnimationPreview: React.FC<AnimationPreviewProps> = ({ 
    frames, 
    palette, 
    label, 
    fps = 6, 
    scale = 4 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % frames.length);
        }, 1000 / fps);
        return () => clearInterval(interval);
    }, [frames.length, fps]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const currentPixels = frames[frameIndex];

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw Checkerboard
        for (let y = 0; y < SPRITE_HEIGHT; y++) {
            for (let x = 0; x < SPRITE_WIDTH; x++) {
                if ((x + y) % 2 === 0) ctx.fillStyle = '#2d3748';
                else ctx.fillStyle = '#1a202c';
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }

        // Draw Pixels
        for (let i = 0; i < currentPixels.length; i++) {
            const colorIdx = currentPixels[i];
            const color = palette[colorIdx];
            if (color) {
                const x = i % SPRITE_WIDTH;
                const y = Math.floor(i / SPRITE_WIDTH);
                ctx.fillStyle = color;
                ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }

    }, [frameIndex, frames, palette, scale]);

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative border border-gray-700 rounded-lg overflow-hidden shadow-lg bg-black">
                <canvas 
                    ref={canvasRef} 
                    width={SPRITE_WIDTH * scale} 
                    height={SPRITE_HEIGHT * scale} 
                />
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/50 text-[10px] text-gray-400 rounded backdrop-blur">
                    frame {frameIndex + 1}/{frames.length}
                </div>
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        </div>
    );
};

export default AnimationPreview;