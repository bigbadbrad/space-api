/******************************
 * File: /agents/helpers/postHelper.js
 ******************************/
const { Post } = require('../../models');

/**
 * Creates a Post record.
 *
 * @param {object} options
 * @param {number} options.userId       - The userId who owns this post
 * @param {number} options.groupTextId  - The ID of the GroupText associated with this post
 * @param {string} options.title        - Post title (optional)
 * @param {string} options.body         - The main text content
 * @param {string} [options.imageUrl]   - Optional image
 * 
 * @returns {Promise<Post>} The newly created Post instance.
 */
async function createPost(options) {
  const {
    userId,
    groupTextId,
    name,
    description,
    imageUrl
  } = options;

  const newPost = await Post.create({
    userId,
    groupTextId,
    name: name || null,
    description: description || '',
    imageUrl: imageUrl || null
  });

  return newPost;
}

module.exports = { createPost };
