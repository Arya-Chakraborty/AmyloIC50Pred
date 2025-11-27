"use client"
import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'ketcher-react/dist/index.css';

const Editor = dynamic(
  () => import('ketcher-react').then((mod) => mod.Editor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-96">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-3"></div>
  </div> }
);

export default function MoleculeDrawer({ onSmilesExtracted, disabled = false }) {
  const ketcherRef = useRef(null);
  const [compoundName, setCompoundName] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [structServiceProvider, setStructServiceProvider] = useState(null);

  useEffect(() => {
    // Dynamically import and initialize the structure service provider
    if (typeof window !== 'undefined') {
      import('ketcher-standalone').then((module) => {
        const provider = new module.StandaloneStructServiceProvider();
        setStructServiceProvider(provider);
      }).catch((error) => {
        console.error('Error loading ketcher-standalone:', error);
      });
    }
  }, []);

  const handleOnInit = (ketcher) => {
    ketcherRef.current = ketcher;
    setIsReady(true);
  };

  const handleGetSmiles = async () => {
    if (ketcherRef.current && isReady) {
      try {
        const smiles = await ketcherRef.current.getSmiles();
        
        if (smiles && smiles.trim() !== '' && smiles.trim() !== 'C') {
          // Format: SMILES, Name (or just SMILES if no name)
          const formattedSmiles = compoundName.trim() 
            ? `${smiles.trim()}, ${compoundName.trim()}`
            : smiles.trim();
          
          // Clear the compound name field before extraction
          setCompoundName('');
          
          // Send SMILES to parent component
          onSmilesExtracted(formattedSmiles);
          
          // Clear the canvas after adding - use setMolecule with empty structure
          setTimeout(async () => {
            if (ketcherRef.current && isReady) {
              try {
                await ketcherRef.current.setMolecule('');
              } catch (error) {
                console.error('Error clearing canvas:', error);
              }
            }
          }, 100);
        } else {
          alert('Please draw a molecule first');
        }
      } catch (error) {
        // Silently log the error but still try to extract
        console.error('Error extracting SMILES:', error);
      }
    }
  };

  const handleClear = async () => {
    if (ketcherRef.current && isReady) {
      try {
        await ketcherRef.current.setMolecule('');
        setCompoundName('');
      } catch (error) {
        console.error('Error clearing editor:', error);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Draw Molecule
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || !isReady}
            className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleGetSmiles}
            disabled={disabled || !isReady}
            className="px-3 py-1 text-xs font-medium text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add to Input
          </button>
        </div>
      </div>
      
      <div className="rounded-lg overflow-hidden" style={{ height: '500px', width: '100%' }}>
        {structServiceProvider ? (
          <Editor
            staticResourcesUrl=""
            structServiceProvider={structServiceProvider}
            onInit={handleOnInit}
            errorHandler={(error) => console.error('Ketcher error:', error)}
          />
        ) : (
          <div className="flex items-center justify-center h-full border-2 border-gray-300 rounded-lg bg-white">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-2"></div>
              <div className="text-sm text-gray-500">Loading editor...</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <label htmlFor="compoundName" className="block text-xs font-medium text-gray-700 mb-1">
          Compound Name (Optional)
        </label>
        <input
          id="compoundName"
          type="text"
          value={compoundName}
          onChange={(e) => setCompoundName(e.target.value)}
          disabled={disabled || !isReady}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 bg-gray-50 placeholder-gray-400 disabled:opacity-50"
          placeholder="Enter compound name (optional)"
        />
      </div>

      <div className="text-xs text-gray-500 mt-2">
        <p><strong>Instructions:</strong></p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li>Draw your molecule using the editor above</li>
          <li>Optionally add a compound name</li>
          <li>Click "Add to Input" to convert to SMILES and add to the textarea</li>
          <li>You can draw multiple molecules and add them one by one</li>
        </ul>
      </div>
    </div>
  );
}
