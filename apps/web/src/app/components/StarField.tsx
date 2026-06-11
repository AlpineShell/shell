"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number;
  maxLife: number;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    const shootingStars: ShootingStar[] = [];
    let raf = 0;
    let last = performance.now();
    let nextShoot = last + (Math.random() * 2400 + 1400);

    const createStars = () => {
      const count = Math.min(Math.round(width * height * 0.00016), 500);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.2 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.5,
        twinkleSpeed: Math.random() * 1.5 + 0.4,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      createStars();
    };

    const spawnShootingStar = () => {
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft
        ? Math.random() * width * 0.4
        : width - Math.random() * width * 0.4;
      const startY = Math.random() * height * 0.35;
      const angle = fromLeft
        ? Math.PI / 4 + (Math.random() * 0.3 - 0.15)
        : (3 * Math.PI) / 4 + (Math.random() * 0.3 - 0.15);
      const speed = Math.random() * 380 + 520;
      shootingStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: Math.random() * 130 + 110,
        life: 0,
        maxLife: Math.random() * 0.5 + 0.7,
      });
    };

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const tw = reduceMotion
          ? 1
          : 0.5 + 0.5 * Math.sin((now / 1000) * s.twinkleSpeed + s.phase);
        ctx.globalAlpha = s.baseAlpha * tw;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reduceMotion) {
        if (now >= nextShoot) {
          spawnShootingStar();
          nextShoot = now + (Math.random() * 2800 + 1400);
        }
        for (let i = shootingStars.length - 1; i >= 0; i--) {
          const sh = shootingStars[i];
          sh.life += dt;
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          const fade = 1 - sh.life / sh.maxLife;
          if (
            fade <= 0 ||
            sh.x < -200 ||
            sh.x > width + 200 ||
            sh.y > height + 200
          ) {
            shootingStars.splice(i, 1);
            continue;
          }
          const mag = Math.hypot(sh.vx, sh.vy) || 1;
          const tailX = sh.x - (sh.vx / mag) * sh.length;
          const tailY = sh.y - (sh.vy / mag) * sh.length;
          const gradient = ctx.createLinearGradient(sh.x, sh.y, tailX, tailY);
          gradient.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
          gradient.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
          ctx.globalAlpha = fade;
          ctx.beginPath();
          ctx.arc(sh.x, sh.y, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    if (reduceMotion) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resize();
      if (reduceMotion) draw(performance.now());
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
