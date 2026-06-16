             <div className="flex items-stretch gap-4 w-full max-w-[min(66vh,66vw)] aspect-square relative">
                <div ref={studyBoardWheelRef} className="flex-1 aspect-square rounded-sm overflow-hidden ring-1 ring-[rgba(255,255,255,0.05)] relative">
                    <Chessboard
                      key={effectiveChapter?.id || 'main'}
                      options={{
                        id: `student-board-${effectiveChapter?.id || 'main'}`,
                        position: studyBoardFen,
                        boardOrientation: studentBoardOrientation,
                        darkSquareStyle: { backgroundColor: '#5d768e' },
                        lightSquareStyle: { backgroundColor: '#c1c9d2' },
                        ...CHESSBOARD_ANIMATION,
                        allowDragging: true,
                        onPieceDrop: vsComputer ? handleVcDrop : handlePieceDrop,
                        squareStyles: studentMainMergedSquareStyles,
                        allowDrawingArrows: true,
                        arrows: (() => {
                          const seen = new Set<string>();
                          const merged: Array<{ startSquare: string; endSquare: string; color: string }> = [];
                          
                          for (const a of boardArrows) {
                            const k = `${a.startSquare.toLowerCase()}-${a.endSquare.toLowerCase()}`;
                            if (!seen.has(k)) {
                              seen.add(k);
                              merged.push({
                                ...a,
                                startSquare: a.startSquare.toLowerCase(),
                                endSquare: a.endSquare.toLowerCase()
                              });
                            }
                          }

                          if (!vsComputer || isVcGameOver) {
                            if (engineHoverMove) {
                              const k = `${engineHoverMove.from.toLowerCase()}-${engineHoverMove.to.toLowerCase()}`;
                              if (!seen.has(k)) {
                                seen.add(k);
                                merged.push({ startSquare: engineHoverMove.from.toLowerCase(), endSquare: engineHoverMove.to.toLowerCase(), color: 'rgba(99,102,241,0.85)' });
                              }
                            } else if (engineEnabled && engineTopMove) {
                              const k = `${engineTopMove.from.toLowerCase()}-${engineTopMove.to.toLowerCase()}`;
                              if (!seen.has(k)) {
                                seen.add(k);
                                merged.push({ startSquare: engineTopMove.from.toLowerCase(), endSquare: engineTopMove.to.toLowerCase(), color: 'rgba(99,102,241,0.4)' });
                              }
                            }
                          }
                          return merged;
                        })(),
                        onArrowsChange: (payload: unknown) => {
                          const raw = Array.isArray(payload)
                            ? (payload as Array<{ startSquare: string; endSquare: string; color: string }>)
                            : ((payload as { arrows?: Array<{ startSquare: string; endSquare: string; color: string }> } | null)?.arrows ?? []);
                          
                          const seen = new Set<string>();
                          const filtered: Array<{ startSquare: string; endSquare: string; color: string }> = [];
                          for (const a of raw) {
                            if (!a.startSquare || !a.endSquare) continue;
                            const k = `${a.startSquare.toLowerCase()}-${a.endSquare.toLowerCase()}`;
                            if (seen.has(k)) continue;
                            if (a.color === 'rgba(99,102,241,0.85)' || a.color === 'rgba(99,102,241,0.4)') continue;
                            seen.add(k);
                            filtered.push({
                              ...a,
                              startSquare: a.startSquare.toLowerCase(),
                              endSquare: a.endSquare.toLowerCase()
                            });
                          }
                          setBoardArrows(filtered);
                        }
                      }}
                    />
                    {vsComputer && vcThinking && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 backdrop-blur-[2px] rounded-sm animate-in fade-in duration-300">
                        <div className="bg-[#1e293b]/90 border border-white/10 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-bold text-white uppercase tracking-widest">Bilgisayar Düşünüyor...</span>
                        </div>
                      </div>
                    )}
                 </div>
             </div>
