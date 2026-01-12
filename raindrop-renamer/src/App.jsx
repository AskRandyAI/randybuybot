import React, { useState, useEffect } from 'react'
import {
  CloudRain,
  Settings,
  Download,
  FileEdit,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FolderOpen
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const DEFAULT_TRAITS = [
  { key: 'Background', value: 'Blue' },
  { key: 'Raindrop Type', value: 'Droplet 1' },
  { key: 'Effect', value: 'None' }
]

function App() {
  const [collectionSize, setCollectionSize] = useState(100)
  const [projectName, setProjectName] = useState('Raindrop Collection')
  const [droplets, setDroplets] = useState(
    Array.from({ length: 14 }, (_, i) => ({
      id: i + 1,
      fileName: `droplet_${i + 1}.png`,
      traits: [
        { key: 'Raindrop Type', value: `Droplet ${i + 1}` },
        { key: 'Rarity', value: 'Common' }
      ]
    }))
  )

  const [renamingScheme, setRenamingScheme] = useState('numbered') // numbered or custom
  const [premintRange, setPremintRange] = useState('1-10')

  const addTraitField = (dropletId) => {
    setDroplets(prev => prev.map(d =>
      d.id === dropletId
        ? { ...d, traits: [...d.traits, { key: '', value: '' }] }
        : d
    ))
  }

  const updateTrait = (dropletId, index, field, value) => {
    setDroplets(prev => prev.map(d =>
      d.id === dropletId
        ? { ...d, traits: d.traits.map((t, i) => i === index ? { ...t, [field]: value } : t) }
        : d
    ))
  }

  const removeDroplet = (id) => {
    setDroplets(prev => prev.filter(d => d.id !== id))
  }

  const addDroplet = () => {
    const nextId = Math.max(...droplets.map(d => d.id), 0) + 1
    setDroplets([...droplets, {
      id: nextId,
      fileName: `new_droplet_${nextId}.png`,
      traits: [{ key: 'Raindrop Type', value: `Droplet ${nextId}` }]
    }])
  }

  // Generate the renaming preview
  const generateRenamingList = () => {
    const list = []
    let currentId = 1

    // Simple round-robin distribution for demo
    // In a real app, users might want to specify quantities
    for (let i = 1; i <= collectionSize; i++) {
      const dropletSource = droplets[(i - 1) % droplets.length]
      list.push({
        id: i,
        sourceFile: dropletSource.fileName,
        newName: `${i}.png`,
        traits: dropletSource.traits
      })
    }
    return list
  }

  return (
    <div className="container">
      <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
        >
          <CloudRain size={48} color="var(--primary)" />
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
            Raindrop <span style={{ color: 'var(--primary)' }}>Renamer</span>
          </h1>
        </motion.div>
        <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>
          Automatic Spreadsheet Utility for Launchmynft.io Collections
        </p>
      </header>

      <main className="grid-layout">
        {/* Sidebar Controls */}
        <aside className="glass" style={{ padding: '1.5rem', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <Settings size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '1.2rem' }}>Collection Config</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Total Collection Size</label>
              <input
                type="number"
                value={collectionSize}
                onChange={(e) => setCollectionSize(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Premint Range (e.g. 1-10)</label>
              <input
                type="text"
                value={premintRange}
                onChange={(e) => setPremintRange(e.target.value)}
                placeholder="1-10"
              />
            </div>

            <div style={{ paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" style={{ width: '100%' }}>
                <Download size={18} />
                Generate Assets & JSON
              </button>
            </div>
          </div >
        </aside >

        {/* Main Content Area */}
        < div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }
        }>
          {/* Master Droplets Table */}
          < section className="glass" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileEdit size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.2rem' }}>1. Define Master Droplets (14 Total)</h2>
              </div>
              <button className="btn btn-outline" onClick={addDroplet}>
                <Plus size={18} />
                Add Droplet
              </button>
            </div>

            <div className="spreadsheet-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>ID</th>
                    <th>Source File Name</th>
                    <th>Traits (Metadata)</th>
                    <th style={{ width: '80px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {droplets.map((droplet) => (
                      <motion.tr
                        key={droplet.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <td>{droplet.id}</td>
                        <td>
                          <input
                            type="text"
                            value={droplet.fileName}
                            onChange={(e) => {
                              const newList = droplets.map(d => d.id === droplet.id ? { ...d, fileName: e.target.value } : d)
                              setDroplets(newList)
                            }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {droplet.traits.map((trait, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '4px' }}>
                                <input
                                  style={{ width: '80px', fontSize: '0.75rem' }}
                                  placeholder="Trait"
                                  value={trait.key}
                                  onChange={(e) => updateTrait(droplet.id, idx, 'key', e.target.value)}
                                />
                                <input
                                  style={{ width: '80px', fontSize: '0.75rem' }}
                                  placeholder="Value"
                                  value={trait.value}
                                  onChange={(e) => updateTrait(droplet.id, idx, 'value', e.target.value)}
                                />
                              </div>
                            ))}
                            <button
                              onClick={() => addTraitField(droplet.id)}
                              style={{ background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '4px', padding: '0 8px' }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn-outline"
                            style={{ padding: '5px', borderRadius: '4px', color: 'var(--danger)' }}
                            onClick={() => removeDroplet(droplet.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section >

          {/* Mapping Preview */}
          < section className="glass" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
              <FolderOpen size={20} color="var(--primary)" />
              <h2 style={{ fontSize: '1.2rem' }}>2. Launchmynft Renaming Preview</h2>
            </div>

            <div className="preview-info" style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(34, 211, 238, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 211, 238, 0.2)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={18} color="var(--accent)" />
              <span>Notice: This will generate a ZIP containing <b>{collectionSize}</b> images and <b>{collectionSize}</b> metadata JSON files.</span>
            </div>

            <div className="spreadsheet-container" style={{ maxHeight: '400px' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '100px' }}>NFT ID</th>
                    <th>Original Source</th>
                    <th>Target Name (Launchmynft Format)</th>
                    <th>Preview Status</th>
                  </tr>
                </thead>
                <tbody>
                  {generateRenamingList().slice(0, 20).map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>#{item.id} {item.id <= parseInt(premintRange.split('-')[1]) ? '(PREMINT)' : ''}</td>
                      <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.sourceFile}</td>
                      <td><code>{item.newName}</code></td>
                      <td style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <CheckCircle2 size={14} /> Ready
                      </td>
                    </tr>
                  ))}
                  {collectionSize > 20 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        ... and {collectionSize - 20} more items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section >
        </div >
      </main >

      <footer style={{ marginTop: '4rem', textAlign: 'center', padding: '2rem', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        &copy; 2026 RandyAI NFT Renamer Suite. Built for the RandyVerse.
      </footer>
    </div >
  )
}

export default App
