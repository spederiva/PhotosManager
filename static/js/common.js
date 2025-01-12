// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Displays the overlay loading dialog.
function showLoadingDialog(text = 'Loading ...') {
    $('.loading-dialog h1').text(text);

    $('.loading-dialog').show();
}

// Hides the overlay loading dialog.
function hideLoadingDialog() {
    $('.loading-dialog').hide();
    $('#error').hide();
    $('#message').hide();
}

// Shows an error with a title and a JSON object that is pretty printed.
function showJsonError(title, json) {
    const message = typeof (json) === 'string' ? json : json && json.error && json.error.message;

    showError(title, message || JSON.stringify(json, null, 2));
}

// Shows an error with a title and text. Scrolls the screen to show the error.
function showError(title, text) {
    // Hide the loading dialog, just in case it is still being displayed.
    hideLoadingDialog();

    $('#errorTitle').text(title);
    $('#errorMessage').text(text);
    $('#error').show();

    // Scroll to show the error message on screen.
    $('html,body').animate({ scrollTop: $('#error').offset().top }, 300);
}

function showMessage(title, text) {
    // Hide the loading dialog, just in case it is still being displayed.
    hideLoadingDialog();

    $('#messageTitle').text(title);
    $('#messageMessage').text(text);
    $('#message').show();

    // Scroll to show the error message on screen.
    $('html,body').animate({ scrollTop: $('#error').offset().top }, 300);
}

// Hides the error message.
function hideError() {
    $('#error').hide();
}

// Handles errors returned from the backend.
// Intended to be used as the error handler for ajax request to the backend.
// For authentication issues, the user is redirected to the log out screen.
// Otherwise, the error is shown to the user (and prettyprinted if possible).
function handleError(title, data, err) {
    console.log('Error: ', data, err);

    hideLoadingDialog();

    if (data.status == 401 || (err && err.responseJSON && err.responseJSON.error === 'invalid_grant')) {
        // Authentication error. Redirect back to the log in screen.
        window.location = '/logout';
    } else if (data.status == 0) {
        // Server could not be reached from the request.
        // It could be blocked, unavailable or unresponsive.
        showError(title, 'Server could not be reached. Please try again.');
    } else if (data.responseJSON) {
        // JSON error that can be formatted.
        showJsonError(title, data.responseJSON.message || data.responseJSON);
    } else {
        // Otherwise, display the data returned by the request.
        showError(title, data.responseText || data);
    }
}
