import { useState, useEffect } from 'react';

export const usePDFLibrary = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement;
        if (existingScript) {
          if (existingScript.dataset.loaded === 'true') {
            resolve();
            return;
          }
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', reject);
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.dataset.loaded = 'false';
        script.onload = () => {
          script.dataset.loaded = 'true';
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const init = async () => {
      try {
        // Load jsPDF first
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        
        // Ensure global availability for the plugin
        if (window.jspdf && window.jspdf.jsPDF) {
           window.jsPDF = window.jspdf.jsPDF;
        }
        
        // Load AutoTable plugin
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js');
        
        setLoaded(true);
      } catch (error) {
        console.error("Failed to load PDF libraries:", error);
      }
    };

    init();
  }, []);

  return loaded;
};