import { Comment } from '../serverTypes';
import { AppDispatch, UnknownAction } from '../store';
import { addComment, commentsTree, Node, searchTree } from './commentsTree';
import { commentsCountIncremented } from './postsSlice';

/**
 * Builds a tree of comments, but preserves the server's
 * top-level ordering exactly as received.
 */
export function commentsTreePreserveOrder(comments: Comment[]): Node {
  // A minimal “root” pseudo-node; its children will be top-level comments.
  const rootNode: Node = {
    comment: null,
    children: [],
    parent: null,
    noRepliesRendered: 0,
    collapsed: false
  };

  // A map of commentID -> Node to help us quickly attach children
  const nodeMap: Record<string, Node> = {};

  // First, create a Node object for each comment in the order received
  // and insert into nodeMap.
  for (const c of comments) {
    nodeMap[c.id] = {
      comment: c,
      children: [],
      parent: null,
      noRepliesRendered: 0,
      collapsed: false,
    };
  }

  // Now attach children to their parents, if any
  for (const c of comments) {
    const node = nodeMap[c.id];
    if (c.parentId) {
      const parentNode = nodeMap[c.parentId];
      if (parentNode) {
        node.parent = parentNode;
        parentNode.children?.push(node);
      } else {
        // If the parent wasn't found, treat it as top-level to avoid losing data
        rootNode.children?.push(node);
        node.parent = rootNode;
      }
    } else {
      // No parent (top-level comment), so attach directly under root
      rootNode.children?.push(node);
      node.parent = rootNode;
    }
  }

  return rootNode;
}

export interface CommentsState {
  ids: string[];
  items: {
    [postId: string]: {
      comments: Node;
      next: string | null;
      zIndexTop: number;
      fetchedAt: number;
      lastFetchedAt: number;
    };
  };
}

const initialState: CommentsState = {
  ids: [],
  items: {
    /*
      "post_id": {
          comments: tree,
          next: 'pagination cursor',
          zIndexTop: 1000000,
          fetchedAt: ,
          lastFetchedAt: , // last time any new comments were fetched.
      }
    */
  },
};

export const defaultCommentZIndex = 100000;

const typeCommentsAdded = 'comments/commentsAdded';
const typeNewCommentAdded = 'comments/newCommentAdded';
const typeReplyCommentsAdded = 'comments/replyCommentsAdded';
const typeMoreCommentsAdded = 'comments/moreCommentsAdded';
const typeCommentsLoaded = 'comments/commentsLoaded';

export default function commentsReducer(
  state: CommentsState = initialState,
  action: UnknownAction
): CommentsState {
  switch (action.type) {
    case typeCommentsAdded: {
      const {
        postId,
        comments: commentsList,
        next,
      } = action.payload as { postId: string; comments: Comment[]; next: string | null };
      if (state.ids.includes(postId)) return state;
      return {
        ...state,
        items: {
          ...state.items,
          [postId]: {
            comments: commentsTree(commentsList),
            next,
            zIndexTop: defaultCommentZIndex,
            fetchedAt: Date.now(),
            lastFetchedAt: Date.now(),
          },
        },
      };
    }
    case typeMoreCommentsAdded: {
      const { postId, comments, next } = action.payload as {
        postId: string;
        comments: Node;
        next: string | null;
      };
      return {
        ...state,
        items: {
          [postId]: {
            ...state.items[postId],
            comments,
            next,
            lastFetchedAt: Date.now(),
          },
        },
      };
    }
    case typeNewCommentAdded: {
      const { comment, postId } = action.payload as { comment: Comment; postId: string };
      let updateZIndex = false;
      const root = state.items[postId].comments;
      const node = addComment(root, comment);
      if (node.parent!.parent !== null && root.children) {
        let rootNode = node;
        while (rootNode.parent!.parent) {
          rootNode = rootNode.parent!;
        }
        const children = root.children;
        const newChildren = [];
        for (let i = 0; i < children.length; i++) {
          if (children[i].comment!.id === rootNode.comment!.id) {
            newChildren.push({ ...rootNode });
          } else {
            newChildren.push(children[i]);
          }
        }
        root.children = newChildren;
      } else {
        updateZIndex = true;
      }
      return {
        ...state,
        items: {
          ...state.items,
          [postId]: {
            ...state.items[postId],
            comments: { ...root },
            zIndexTop: updateZIndex
              ? state.items[postId].zIndexTop + 1
              : state.items[postId].zIndexTop,
          },
        },
      };
    }
    case typeReplyCommentsAdded: {
      const { postId, comments } = action.payload as { postId: string; comments: Comment[] };
      const newComments: Comment[] = [];
      const root = state.items[postId].comments;
      comments.forEach((comment) => {
        if (searchTree(root, comment.id) === null) newComments.push(comment);
      });
      return {
        ...state,
        items: {
          ...state.items,
          [postId]: {
            ...state.items[postId],
            comments: { ...commentsTree(newComments, root) },
            lastFetchedAt: Date.now(),
          },
        },
      };
    }
    case typeCommentsLoaded: {
      const { postId, comments } = action.payload as { postId: string; comments: Comment[] };

      // Use the new function that preserves the server’s top-level order
      const tree = commentsTreePreserveOrder(comments);

      return {
        ...state,
        items: {
          ...state.items,
          [postId]: {
            ...state.items[postId],
            comments: tree,
            // next, fetchedAt, etc. can still be set as you wish
          },
        },
      };
    }
    default:
      return state;
  }
}

export const commentsAdded = (postId: string, comments: Comment[], next: string | null) => {
  return {
    type: typeCommentsAdded,
    payload: {
      postId,
      comments,
      next,
    },
  };
};

export const newCommentAdded = (postId: string, comment: Comment) => (dispatch: AppDispatch) => {
  dispatch({ type: typeNewCommentAdded, payload: { postId, comment } });
  dispatch(commentsCountIncremented(postId));
};

export const replyCommentsAdded = (postId: string, comments: Comment[]) => {
  return { type: typeReplyCommentsAdded, payload: { postId, comments } };
};

export const moreCommentsAdded = (postId: string, comments: Node, next: string | null) => {
  return {
    type: typeMoreCommentsAdded,
    payload: {
      postId,
      comments,
      next,
    },
  };
};

export const commentsLoaded = (postId: string, comments: Comment[]) => {
  return {
    type: typeCommentsLoaded,
    payload: { postId, comments },
  };
};
