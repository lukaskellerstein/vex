import gsap from "gsap";
import React, { useEffect, useRef } from "react";

/**
 * A visually attractive GSAP-animated "agent is working" state.
 * Shows pulsing neural-network-style orbs with connecting lines
 * and a subtle particle effect while waiting for the first trace step.
 */
export function AgentWorkingAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to container
    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // --- Orb nodes ---
    const orbCount = 7;
    const orbs: { x: number; y: number; r: number; alpha: number; phase: number }[] = [];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (let i = 0; i < orbCount; i++) {
      const angle = (i / orbCount) * Math.PI * 2;
      const radius = 80 + Math.random() * 40;
      orbs.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        r: 4 + Math.random() * 4,
        alpha: 0.3 + Math.random() * 0.5,
        phase: i * 0.9,
      });
    }

    // --- Particles ---
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
    }[] = [];

    function spawnParticle() {
      const orb = orbs[Math.floor(Math.random() * orbs.length)];
      particles.push({
        x: orb.x,
        y: orb.y,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        life: 0,
        maxLife: 60 + Math.random() * 80,
        size: 1 + Math.random() * 2,
      });
    }

    // Primary color: extract from CSS var
    const primary = getComputedStyle(container).getPropertyValue("--primary").trim() || "#a78bfa";

    let time = 0;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.02;

      const currentCx = canvas.width / 2;
      const currentCy = canvas.height / 2;

      // Update orb positions (gentle floating)
      for (let i = 0; i < orbs.length; i++) {
        const angle = (i / orbCount) * Math.PI * 2 + time * 0.3;
        const radius = 80 + Math.sin(time + orbs[i].phase) * 20;
        orbs[i].x = currentCx + Math.cos(angle) * radius;
        orbs[i].y = currentCy + Math.sin(angle) * radius;
        orbs[i].alpha = 0.3 + Math.sin(time * 2 + orbs[i].phase) * 0.3;
      }

      // Draw connecting lines between nearby orbs
      ctx.lineWidth = 1;
      for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) {
          const dx = orbs[i].x - orbs[j].x;
          const dy = orbs[i].y - orbs[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            const lineAlpha = (1 - dist / 180) * 0.25 * Math.min(orbs[i].alpha, orbs[j].alpha);
            ctx.strokeStyle = `${primary}${Math.round(lineAlpha * 255)
              .toString(16)
              .padStart(2, "0")}`;
            ctx.beginPath();
            ctx.moveTo(orbs[i].x, orbs[i].y);
            ctx.lineTo(orbs[j].x, orbs[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw center orb (larger, pulsing)
      const centerPulse = 0.4 + Math.sin(time * 1.5) * 0.3;
      const centerR = 12 + Math.sin(time * 2) * 3;

      // Center glow
      const gradient = ctx.createRadialGradient(
        currentCx,
        currentCy,
        0,
        currentCx,
        currentCy,
        centerR * 4,
      );
      gradient.addColorStop(
        0,
        `${primary}${Math.round(centerPulse * 80)
          .toString(16)
          .padStart(2, "0")}`,
      );
      gradient.addColorStop(1, `${primary}00`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(currentCx, currentCy, centerR * 4, 0, Math.PI * 2);
      ctx.fill();

      // Center orb
      ctx.fillStyle = `${primary}${Math.round(centerPulse * 255)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.beginPath();
      ctx.arc(currentCx, currentCy, centerR, 0, Math.PI * 2);
      ctx.fill();

      // Draw orbiting orbs
      for (const orb of orbs) {
        // Glow
        const glowGrad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r * 3);
        glowGrad.addColorStop(
          0,
          `${primary}${Math.round(orb.alpha * 60)
            .toString(16)
            .padStart(2, "0")}`,
        );
        glowGrad.addColorStop(1, `${primary}00`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Orb
        ctx.fillStyle = `${primary}${Math.round(orb.alpha * 255)
          .toString(16)
          .padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();

        // Line to center
        const lineToCenterAlpha = orb.alpha * 0.15;
        ctx.strokeStyle = `${primary}${Math.round(lineToCenterAlpha * 255)
          .toString(16)
          .padStart(2, "0")}`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(orb.x, orb.y);
        ctx.lineTo(currentCx, currentCy);
        ctx.stroke();
      }

      // Spawn & draw particles
      if (Math.random() < 0.3) spawnParticle();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const pAlpha = 1 - p.life / p.maxLife;
        ctx.fillStyle = `${primary}${Math.round(pAlpha * 100)
          .toString(16)
          .padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * pAlpha, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    // GSAP timeline for the text
    const tl = gsap.timeline({ repeat: -1 });
    const textEl = container.querySelector(".agent-working-text");
    if (textEl) {
      tl.to(textEl, { opacity: 0.4, duration: 1.2, ease: "sine.inOut" }).to(textEl, {
        opacity: 1,
        duration: 1.2,
        ease: "sine.inOut",
      });
    }
    tlRef.current = tl;

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      if (tlRef.current) {
        tlRef.current.kill();
        tlRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <p
          className="agent-working-text"
          style={{
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--foreground-muted)",
            margin: 0,
          }}
        >
          Agent is thinking...
        </p>
        <p
          style={{
            fontSize: "12px",
            color: "var(--foreground-dim)",
            margin: 0,
          }}
        >
          Steps will appear here in real-time
        </p>
      </div>
    </div>
  );
}
