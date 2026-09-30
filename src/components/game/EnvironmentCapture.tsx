import { createPortal, useThree } from "@react-three/fiber";
import { type PropsWithChildren, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** Capture the scene's static Lightformers once as a small environment map. */
export function EnvironmentCapture({ children }: PropsWithChildren) {
  const { gl, scene } = useThree();
  const camera = useRef<THREE.CubeCamera>(null);
  const [environmentScene] = useState(() => new THREE.Scene());
  const renderTarget = useMemo(() => {
    const target = new THREE.WebGLCubeRenderTarget(64);
    target.texture.type = THREE.HalfFloatType;
    return target;
  }, []);

  useLayoutEffect(() => () => renderTarget.dispose(), [renderTarget]);

  useLayoutEffect(() => {
    const previousEnvironment = scene.environment;
    const previousAutoClear = gl.autoClear;
    gl.autoClear = true;
    try {
      camera.current?.update(gl, environmentScene);
    } finally {
      gl.autoClear = previousAutoClear;
    }
    scene.environment = renderTarget.texture;

    return () => {
      scene.environment = previousEnvironment;
    };
  }, [children, environmentScene, gl, renderTarget, scene]);

  return createPortal(
    <>
      {children}
      <cubeCamera ref={camera} args={[0.1, 1000, renderTarget]} />
    </>,
    environmentScene,
  );
}
