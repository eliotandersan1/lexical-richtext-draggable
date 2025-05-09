import { useState, useEffect, useMemo, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister, registerNestedElementResolver } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $getNodeByKey
} from "lexical";
import {
  $createMarkNode,
  $isMarkNode,
  $wrapSelectionInMarkNode,
  $unwrapMarkNode,
  $getMarkIDs,
  MarkNode
} from "@lexical/mark";

export default function SaveSelectionPlugin() {
  const [editor] = useLexicalComposerContext();
  const active = useRef();
  const markNodeMap = useMemo(() => {
    return new Map();
  }, []);
  const [activeIDs, setActiveIDs] = useState([]);

  useEffect(() => {
    function handleBlur() {
      // You may want to filter on the event target here
      // to only include clicks on certain types of DOM Nodes
      editor.update(() => {
        const selection = $getSelection();
        const { anchor, focus } = selection;
        if (
          $isRangeSelection(selection) &&
          (anchor.key !== focus.key || anchor.offset !== focus.offset)
        ) {
          const focus = selection.focus;
          const anchor = selection.anchor;
          const isBackward = selection.isBackward();
          const id = "SOME_UNIQUE_ID";

          // Wrap content in a MarkNode
          $wrapSelectionInMarkNode(selection, isBackward, id);

          // Make selection collapsed at the end
          if (isBackward) {
            focus.set(anchor.key, anchor.offset, anchor.type);
          } else {
            anchor.set(focus.key, focus.offset, focus.type);
          }
        }
      });
      window.getSelection().empty();
      window.getSelection().removeAllRanges();
    }

    function handleFocus() {
      // You may want to filter on the event target here
      // to only include clicks on certain types of DOM Nodes.
      const id = "SOME_UNIQUE_ID";
      const markNodeKeys = markNodeMap.get(id);
      if (markNodeKeys !== undefined) {
        editor.update(() => {
          for (const key of markNodeKeys) {
            const node = $getNodeByKey(key);
            if ($isMarkNode(node)) {
              node.deleteID(id);
              if (node.getIDs().length === 0) {
                $unwrapMarkNode(node);
              }
            }
          }
        });
      }
    }

    if (editor) {
      editor.registerRootListener((rootElement, prevRootElement) => {
        // add the listener to the current root element
        rootElement?.addEventListener("blur", handleBlur);
        rootElement?.addEventListener("focus", handleFocus);
        rootElement?.addEventListener("click", handleFocus);

        prevRootElement?.removeEventListener("blur", handleBlur);
        prevRootElement?.removeEventListener("focus", handleFocus);
        rootElement?.addEventListener("click", handleFocus);
      });
    }
    // teardown the listener - return this from your useEffect callback if you're using React.
    return () => {
      editor.registerRootListener((rootElement, prevRootElement) => {
        rootElement?.removeEventListener("blur", handleBlur);
        rootElement?.removeEventListener("focus", handleFocus);
        rootElement?.addEventListener("click", handleFocus);

        prevRootElement?.removeEventListener("blur", handleBlur);
        prevRootElement?.removeEventListener("focus", handleFocus);
        prevRootElement?.removeEventListener("click", handleFocus);
      });
    };
  }, [editor, active, markNodeMap]);

  useEffect(() => {
    const changedElems = [];
    for (let i = 0; i < activeIDs.length; i++) {
      const id = activeIDs[i];
      const keys = markNodeMap.get(id);
      if (keys !== undefined) {
        for (const key of keys) {
          const elem = editor.getElementByKey(key);
          if (elem !== null) {
            elem.classList.add("selected");
            changedElems.push(elem);
          }
        }
      }
    }
    return () => {
      for (let i = 0; i < changedElems.length; i++) {
        const changedElem = changedElems[i];
        changedElem.classList.remove("selected");
      }
    };
  }, [activeIDs, editor, markNodeMap]);

  useEffect(() => {
    const markNodeKeysToIDs = new Map();

    return mergeRegister(
      registerNestedElementResolver(
        editor,
        MarkNode,
        (from) => {
          return $createMarkNode(from.getIDs());
        },
        (from, to) => {
          // Merge the IDs
          const ids = from.getIDs();
          ids.forEach((id) => {
            to.addID(id);
          });
        }
      ),
      editor.registerMutationListener(MarkNode, (mutations) => {
        editor.getEditorState().read(() => {
          for (const [key, mutation] of mutations) {
            const node = $getNodeByKey(key);
            let ids = [];

            if (mutation === "destroyed") {
              ids = markNodeKeysToIDs.get(key) || [];
            } else if ($isMarkNode(node)) {
              ids = node.getIDs();
            }

            for (let i = 0; i < ids.length; i++) {
              const id = ids[i];
              let markNodeKeys = markNodeMap.get(id);
              markNodeKeysToIDs.set(key, ids);

              if (mutation === "destroyed") {
                if (markNodeKeys !== undefined) {
                  markNodeKeys.delete(key);
                  if (markNodeKeys.size === 0) {
                    markNodeMap.delete(id);
                  }
                }
              } else {
                if (markNodeKeys === undefined) {
                  markNodeKeys = new Set();
                  markNodeMap.set(id, markNodeKeys);
                }
                if (!markNodeKeys.has(key)) {
                  markNodeKeys.add(key);
                }
              }
            }
          }
        });
      }),
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          let hasActiveIds = false;

          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();

            if ($isTextNode(anchorNode)) {
              const commentIDs = $getMarkIDs(
                anchorNode,
                selection.anchor.offset
              );
              if (commentIDs !== null) {
                setActiveIDs(commentIDs);
                hasActiveIds = true;
              }
            }
          }
          if (!hasActiveIds) {
            setActiveIDs((_activeIds) =>
              _activeIds.length === 0 ? _activeIds : []
            );
          }
        });
      })
    );
  }, [editor, markNodeMap]);

  return null;
}
