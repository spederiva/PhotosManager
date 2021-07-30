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
    showLoadingDialog('Adding selected albums!');

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
            hideLoadingDialog();

            const itemsUploaded = data.foldersResult.reduce( (agg, curr) => agg + curr.items, 0 );

            showMessage('Everything OK', `${data.foldersResult.length} folder/s and ${itemsUploaded} photos were upload successfully!. Dead Letter: ${data.deadletterCount}`);
        },
        error: (data) => {
            handleError('Couldn\'t import album', data);
        }
    });
}

function processDeadletter() {
    showLoadingDialog('Process Dead Letter!');

    $.ajax({
        type: 'POST',
        url: '/processDeadletter',
        dataType: 'json',
        data: {  },
        success: (data) => {
            hideLoadingDialog();

            if(data.deadletterLeftCounter > 0){
                handleError(`Dead Letter not empty', 'Please take care to empty the dead letter. Counter: ${data.deadletterLeftCounter}`);

                return;
            }

            listAlbums();
        },
        error: (data) => {
            handleError('Couldn\'t process dead letter', 'Try again refreshing the page');
        }
    });
}

$(document).ready(() => {
    processDeadletter();
});
