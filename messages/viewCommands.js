// /messages/viewCommands.js 
function viewCommands() {
    let responseMessage = `Group Text commands:\n`;

    responseMessage += "\n'info' to view the current event";
    responseMessage += "\n\n'rsvps' to view event RSVPs";
    responseMessage += "\n\n'photos' to view photos from this event";
    responseMessage += "\n\n'schedule' to view the detailed schedule for this event";
    responseMessage += "\n\nFor your own invites, check out Group Text and sign up at:";
    responseMessage += "\nhttps://grouptext.co";

    return responseMessage.trim();
}

module.exports = viewCommands;
