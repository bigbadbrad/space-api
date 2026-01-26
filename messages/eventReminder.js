// /messages/eventReminder.js

function eventReminder(firstName, eventDescription) {
    let responseMessage = `🎉 Reminder 🎉 ${firstName}'s ${eventDescription} event starts in 2 hours.\n`;
  
    responseMessage += "\nTo add photos to this event, simply select a photo or photos (5 max) from your phone's Photos, and text them to the Group Text number.";
    responseMessage += "\n\nTo view photos from this event, text 'photos' to the Group Text number.";
    responseMessage += "\n\nFor your own invites, check out Group Text and sign up at:";
    responseMessage += "\nhttps://grouptext.co";
  
    return responseMessage.trim();
  }
  
  module.exports = eventReminder;