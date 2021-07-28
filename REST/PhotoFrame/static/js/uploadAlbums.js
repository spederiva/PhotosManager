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

// Notifies the backend to load an album into the photo frame queue.
// If the request is successful, the photo frame queue is opened,
// otherwise an error message is shown.
function loadFromAlbum(name, id) {
    showLoadingDialog();
    // Make an ajax request to the backend to load from an album.
    $.ajax({
        type: 'POST',
        url: '/loadFromAlbum',
        dataType: 'json',
        data: { albumId: id },
        success: (data) => {
            console.log('Albums imported:' + JSON.stringify(data.parameters));
            if (data.photos && data.photos.length) {
                // Photos were loaded from the album, open the photo frame preview
                // queue.
                window.location = '/';
            } else {
                // No photos were loaded. Display an error.
                handleError('Couldn\'t import album', 'Album is empty.');
            }
            hideLoadingDialog();
        },
        error: (data) => {
            handleError('Couldn\'t import album', data);
        }
    });
}

// Loads a list of all albums owned by the logged in user from the backend.
// The backend returns a list of albums from the Library API that is rendered
// here in a list with a cover image, title and a link to open it in Google
// Photos.
function listAlbums() {
    hideError();
    showLoadingDialog();
    $('#albums').empty();

    $.ajax({
        type: 'GET',
        url: '/getFolders',
        dataType: 'json',
        success: (data) => {
            console.log('Loaded albums: ', data);

            $.each(data, (i, item) => {
                const thumbnailUrl = `${item.coverPhotoBaseUrl}=w100-h100`;

                // Set up a Material Design Lite list.
                const materialDesignLiteList = $('<li />').addClass('mdl-list__item mdl-list__item--two-line');

                // Create the primary content for this list item.
                const primaryContentRoot = $('<div />').addClass('mdl-list__item-primary-content');
                materialDesignLiteList.append(primaryContentRoot);

                // The image showing the album thumbnail.
                const primaryContentImage = $('<input type="checkbox" name="folders" />')
                    .attr('value', item.folderName)
                    .attr('fullPath', item.fullPath)
                    .addClass('mdl-list__item-avatar');
                primaryContentRoot.append(primaryContentImage);

                // The title of the album as the primary title of this item.
                const primaryContentTitle = $('<div />').text(item.folderName);
                primaryContentRoot.append(primaryContentTitle);

                // The number of items in this album as the sub title.
                const primaryContentSubTitle = $('<div />').text(`(${item.itemCount} items)`).addClass('mdl-list__item-sub-title');
                primaryContentRoot.append(primaryContentSubTitle);


                // Add the list item to the list of albums.
                $('#albums').append(materialDesignLiteList);
            });

            hideLoadingDialog();
            console.log('Albums loaded.');
        },
        error: (data) => {
            hideLoadingDialog();
            handleError('Couldn\'t load albums', data);
        }
    });
}

function addAlbum() {
    hideLoadingDialog();

    const checkedFolders = $("input[name='folders']:checked")
        .map((idx, inp) => ({ folderName: inp.value, fullPath: inp.getAttribute('fullPath') }))
        .toArray();

    console.log('Folders', checkedFolders);

    if(checkedFolders.length === 0){
        showError('No Folder Selected', 'Please select at least one folder');

        return;
    }

    $.ajax({
        type: 'POST',
        url: '/addAlbums',
        dataType: 'json',
        data: { checkedFolders },
        success: (data) => {
            const itemsUploaded = data.folders.reduce( (agg, curr) => agg + curr.items, 0 );

            showMessage('Everything OK', `${data.folders.length} folder/s and ${itemsUploaded} photos were upload successfully!. Dead Letter: ${data.deadletterCount}`);
        },
        error: (data) => {
            handleError('Couldn\'t import album', data);
        }
    });
}

$(document).ready(() => {
    // Load the list of albums from the backend when the page is ready.
    listAlbums();

    // Clicking the 'add to frame' button starts an import request.
    $('#albums').on('click', '.album-title', (event) => {
        const target = $(event.currentTarget);
        const albumId = target.attr('data-id');
        const albumTitle = target.attr('data-title');

        console.log('Importing album: ' + albumTitle);

        loadFromAlbum(albumTitle, albumId);
    });
});
